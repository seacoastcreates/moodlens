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
    assert "debug" not in body  # diagnostics go to server logs, not clients


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


def test_history_create_and_list_roundtrip(registered_client):
    payload = {
        "mode": "text",
        "text": "feeling good",
        "file_url": None,
        "top_label": "joy",
        "scores": [{"label": "joy", "score": 0.9}, {"label": "neutral", "score": 0.1}],
    }

    created = registered_client.post("/history", json=payload)
    assert created.status_code == 200
    assert created.json()["top_label"] == "joy"

    listed = registered_client.get("/history")
    assert listed.status_code == 200
    entries = listed.json()
    assert len(entries) == 1
    assert entries[0]["top_label"] == "joy"


def test_history_list_is_scoped_to_the_authenticated_user(client):
    user_a = client.post("/register").json()
    user_b = client.post("/register").json()

    client.post(
        "/history",
        json={
            "mode": "text",
            "top_label": "anger",
            "scores": [{"label": "anger", "score": 1.0}],
        },
        headers={"Authorization": f"Bearer {user_a['token']}"},
    )

    # user_b never posted anything, and can't see user_a's entry either -
    # even though both share the same app-wide API key.
    res_b = client.get("/history", headers={"Authorization": f"Bearer {user_b['token']}"})
    assert res_b.status_code == 200
    assert res_b.json() == []

    res_a = client.get("/history", headers={"Authorization": f"Bearer {user_a['token']}"})
    assert res_a.status_code == 200
    assert len(res_a.json()) == 1


def test_history_delete_removes_only_the_callers_entries(client):
    user_a = client.post("/register").json()
    user_b = client.post("/register").json()
    entry = {"mode": "text", "top_label": "joy", "scores": [{"label": "joy", "score": 1.0}]}
    for user in (user_a, user_b):
        client.post("/history", json=entry, headers={"Authorization": f"Bearer {user['token']}"})

    res = client.delete("/history", headers={"Authorization": f"Bearer {user_a['token']}"})
    assert res.status_code == 200
    assert res.json() == {"deleted": 1}

    res_a = client.get("/history", headers={"Authorization": f"Bearer {user_a['token']}"})
    assert res_a.json() == []
    res_b = client.get("/history", headers={"Authorization": f"Bearer {user_b['token']}"})
    assert len(res_b.json()) == 1


def test_analyze_is_rate_limited_per_client_ip(client, monkeypatch):
    monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 3)
    monkeypatch.setattr(main, "get_text_pipeline", lambda: (lambda text: [[{"label": "joy", "score": 1.0}]]))

    for _ in range(3):
        assert client.post("/analyze", json={"text": "hi"}, headers={"X-Forwarded-For": "1.2.3.4"}).status_code == 200
    blocked = client.post("/analyze", json={"text": "hi"}, headers={"X-Forwarded-For": "1.2.3.4"})
    assert blocked.status_code == 429

    # A different client isn't affected.
    other = client.post("/analyze", json={"text": "hi"}, headers={"X-Forwarded-For": "5.6.7.8"})
    assert other.status_code == 200


def test_rate_limit_ignores_client_supplied_forwarded_entries(client, monkeypatch):
    monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 2)
    monkeypatch.setattr(main, "get_text_pipeline", lambda: (lambda text: [[{"label": "joy", "score": 1.0}]]))

    # Rotating a fake leading entry doesn't reset the limit; the appended
    # (real) address is what counts.
    codes = [
        client.post("/analyze", json={"text": "hi"}, headers={"X-Forwarded-For": f"10.0.0.{i}, 1.2.3.4"}).status_code
        for i in range(3)
    ]
    assert codes == [200, 200, 429]
