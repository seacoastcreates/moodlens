import io

import numpy as np
import soundfile as sf

import main


def test_root_returns_ok(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_analyze_text_returns_top_label(client, monkeypatch):
    # Avoid downloading/running the real HF model in tests.
    fake_scores = [[{"label": "joy", "score": 0.8}, {"label": "sadness", "score": 0.2}]]
    monkeypatch.setattr(main, "get_text_pipeline", lambda: (lambda text: fake_scores))

    res = client.post("/analyze", json={"text": "what a wonderful day"})

    assert res.status_code == 200
    body = res.json()
    assert body["top_label"] == "joy"
    assert body["scores"][0]["label"] == "joy"


def _wav_bytes(samples: np.ndarray, sr: int) -> io.BytesIO:
    buf = io.BytesIO()
    sf.write(buf, samples, sr, format="WAV")
    buf.seek(0)
    return buf


def test_analyze_audio_returns_top_label(client, monkeypatch):
    sr = main.TARGET_SR
    t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False)
    tone = (0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)

    fake_window_scores = [
        {"label": "happy", "score": 0.7},
        {"label": "sad", "score": 0.3},
    ]
    monkeypatch.setattr(main, "get_audio_pipeline", lambda: (lambda _input: fake_window_scores))

    res = client.post(
        "/analyze-audio",
        files={"file": ("voice.wav", _wav_bytes(tone, sr), "audio/wav")},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["top_label"] == "joy"  # "happy" is mapped into the text label space
    assert body["scores"][0]["label"] == "joy"
    assert "debug" in body


def test_analyze_audio_rejects_clip_shorter_than_minimum(client):
    # Total audio is well under the 0.8s "not enough speech" floor, regardless
    # of how much of it librosa's voice-activity split keeps.
    sr = main.TARGET_SR
    t = np.linspace(0, 0.3, int(sr * 0.3), endpoint=False)
    short_tone = (0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)

    res = client.post(
        "/analyze-audio",
        files={"file": ("too_short.wav", _wav_bytes(short_tone, sr), "audio/wav")},
    )

    assert res.status_code == 400
    assert "not enough speech" in res.json()["detail"].lower()


def test_history_create_and_list_roundtrip(client):
    payload = {
        "user_id": "test-user-1",
        "mode": "text",
        "text": "feeling good",
        "file_url": None,
        "top_label": "joy",
        "scores": [{"label": "joy", "score": 0.9}, {"label": "neutral", "score": 0.1}],
    }

    created = client.post("/history", json=payload)
    assert created.status_code == 200
    assert created.json()["top_label"] == "joy"

    listed = client.get("/history", params={"user_id": "test-user-1"})
    assert listed.status_code == 200
    entries = listed.json()
    assert len(entries) == 1
    assert entries[0]["top_label"] == "joy"


def test_history_list_is_scoped_to_user_id(client):
    client.post(
        "/history",
        json={
            "user_id": "user-a",
            "mode": "text",
            "top_label": "anger",
            "scores": [{"label": "anger", "score": 1.0}],
        },
    )

    res = client.get("/history", params={"user_id": "user-b"})
    assert res.status_code == 200
    assert res.json() == []
