import numpy as np
import pytest

from main import (
    _avg_and_sharpen,
    _entropy,
    _loudness_normalize,
    _map_to_text_space,
    _segment,
)


def test_map_to_text_space_merges_calm_into_neutral():
    scores = [
        {"label": "calm", "score": 0.15},
        {"label": "neutral", "score": 0.25},
        {"label": "happy", "score": 0.6},
    ]
    merged = _map_to_text_space(scores)
    labels = {d["label"] for d in merged}
    assert labels == {"neutral", "joy"}
    neutral = next(d for d in merged if d["label"] == "neutral")
    assert neutral["score"] == pytest.approx(0.4)
    assert merged[0]["label"] == "joy"  # sorted descending by score


def test_map_to_text_space_empty_input_returns_empty():
    assert _map_to_text_space([]) == []


def test_avg_and_sharpen_averages_across_windows():
    windows = [
        [{"label": "a", "score": 0.9}, {"label": "b", "score": 0.1}],
        [{"label": "a", "score": 0.7}, {"label": "b", "score": 0.3}],
    ]
    out = _avg_and_sharpen(windows, temp=1.0)
    scores = {d["label"]: d["score"] for d in out}
    assert scores["a"] == pytest.approx(0.8, abs=1e-6)
    assert scores["b"] == pytest.approx(0.2, abs=1e-6)


def test_avg_and_sharpen_lower_temperature_increases_confidence():
    windows = [[{"label": "a", "score": 0.6}, {"label": "b", "score": 0.4}]]
    sharp = _avg_and_sharpen(windows, temp=0.3)
    mild = _avg_and_sharpen(windows, temp=1.0)
    assert sharp[0]["score"] > mild[0]["score"]


def test_entropy_uniform_distribution_is_higher_than_confident_one():
    uniform = [{"label": "a", "score": 0.5}, {"label": "b", "score": 0.5}]
    confident = [{"label": "a", "score": 0.99}, {"label": "b", "score": 0.01}]
    assert _entropy(uniform) > _entropy(confident)


def test_loudness_normalize_scales_to_target_rms():
    y = np.random.default_rng(0).normal(0, 0.001, size=16000).astype(np.float32)
    out = _loudness_normalize(y, target_rms=0.03)
    rms = np.sqrt(np.mean(np.square(out)))
    assert rms == pytest.approx(0.03, abs=1e-3)


def test_loudness_normalize_leaves_near_silence_untouched():
    y = np.zeros(100, dtype=np.float32)
    out = _loudness_normalize(y)
    assert np.array_equal(out, y)


def test_segment_short_clip_returns_single_window():
    y = np.zeros(8000, dtype=np.float32)  # 0.5s at 16kHz, shorter than the 0.8s window
    segs = _segment(y, sr=16000, win_s=0.8, hop_s=0.4)
    assert len(segs) == 1
    assert np.array_equal(segs[0], y)


def test_segment_long_clip_produces_overlapping_windows():
    y = np.arange(32000, dtype=np.float32)  # 2s at 16kHz
    segs = _segment(y, sr=16000, win_s=0.8, hop_s=0.4)
    assert len(segs) > 1
    assert all(len(seg) == int(0.8 * 16000) for seg in segs)
