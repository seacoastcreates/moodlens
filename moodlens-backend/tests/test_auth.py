from conftest import make_user_token


def test_root_does_not_require_a_key(anon_client):
    res = anon_client.get("/")
    assert res.status_code == 200


def test_history_get_rejects_missing_key(anon_client):
    res = anon_client.get("/history")
    assert res.status_code == 401


def test_history_get_rejects_wrong_key(anon_client):
    res = anon_client.get("/history", headers={"X-API-Key": "not-the-real-key"})
    assert res.status_code == 401


def test_history_post_rejects_missing_key(anon_client):
    res = anon_client.post(
        "/history",
        json={
            "mode": "text",
            "top_label": "joy",
            "scores": [{"label": "joy", "score": 1.0}],
        },
    )
    assert res.status_code == 401


def test_analyze_rejects_missing_key(anon_client):
    res = anon_client.post("/analyze", json={"text": "hello"})
    assert res.status_code == 401


def test_register_requires_api_key(anon_client):
    res = anon_client.post("/register")
    assert res.status_code == 401


def test_register_returns_a_user_id_and_a_matching_token(client):
    res = client.post("/register")
    assert res.status_code == 200
    body = res.json()
    assert body["user_id"]
    assert body["token"].startswith(body["user_id"] + ".")


# -------- The actual vulnerability this replaces --------
# Previously /history took user_id straight from the request (query param on
# GET, body field on POST) with no proof the caller owned that id. Since the
# API key is identical for every install, that meant knowing or guessing
# someone else's user_id was enough to read their journal. These tests pin
# down that the fix actually closes that gap.

def test_history_get_rejects_a_valid_app_key_with_no_bearer_token(client):
    # Has the real shared API key but never registered - this is exactly the
    # request shape that used to succeed by just adding ?user_id=<guess>.
    res = client.get("/history")
    assert res.status_code == 401


def test_history_get_rejects_a_forged_token_for_a_guessed_user_id(client):
    # Attacker doesn't know TOKEN_SECRET, so a token they invent for a
    # user_id they merely observed or guessed won't verify.
    forged = make_user_token("someone-elses-user-id") + "-tampered"
    res = client.get("/history", headers={"Authorization": f"Bearer {forged}"})
    assert res.status_code == 401


def test_history_get_succeeds_with_a_real_registered_token(registered_client):
    res = registered_client.get("/history")
    assert res.status_code == 200


def test_history_delete_requires_a_bearer_token(client):
    res = client.delete("/history")
    assert res.status_code == 401


def test_privacy_policy_is_public(anon_client):
    res = anon_client.get("/privacy")
    assert res.status_code == 200
    assert "Privacy Policy" in res.text
