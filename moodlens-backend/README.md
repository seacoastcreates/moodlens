# MoodLens Backend

FastAPI + Hugging Face emotion classifier.

## Configuration

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL` — Postgres connection string for history storage.
- `API_KEY` — shared secret required (as an `X-API-Key` header) on every
  endpoint except `GET /`. Generate one with:
  `python -c "import secrets; print(secrets.token_urlsafe(32))"`
  The frontend needs the same value in its own `.env` as
  `EXPO_PUBLIC_API_KEY`. This is a single shared secret, not per-user auth —
  it keeps casual/anonymous requests off the API, not a determined attacker
  who has the app bundle (`EXPO_PUBLIC_*` values ship in plain text in the
  client).

## Testing

```bash
pip install -r requirements-dev.txt
pytest
```

Tests use a throwaway sqlite file (not the dev Postgres database) and mock
the Hugging Face pipelines, so they don't require model downloads or a
running Postgres instance.
