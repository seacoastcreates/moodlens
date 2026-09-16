def test_root_does_not_require_a_key(anon_client):
    res = anon_client.get("/")
    assert res.status_code == 200


def test_history_get_rejects_missing_key(anon_client):
    res = anon_client.get("/history", params={"user_id": "someone"})
    assert res.status_code == 401


def test_history_get_rejects_wrong_key(anon_client):
    res = anon_client.get(
        "/history",
        params={"user_id": "someone"},
        headers={"X-API-Key": "not-the-real-key"},
    )
    assert res.status_code == 401


def test_history_post_rejects_missing_key(anon_client):
    res = anon_client.post(
        "/history",
        json={
            "user_id": "someone",
            "mode": "text",
            "top_label": "joy",
            "scores": [{"label": "joy", "score": 1.0}],
        },
    )
    assert res.status_code == 401


def test_analyze_rejects_missing_key(anon_client):
    res = anon_client.post("/analyze", json={"text": "hello"})
    assert res.status_code == 401


def test_history_get_succeeds_with_correct_key(client):
    res = client.get("/history", params={"user_id": "someone"})
    assert res.status_code == 200
