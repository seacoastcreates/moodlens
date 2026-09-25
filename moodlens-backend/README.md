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

## Production deployment (Cloud Run)

Live at `https://moodlens-api-536953926843.us-east1.run.app` (GCP project
`moodlens-36dunes`, region `us-east1`). The privacy policy is served from the
same service at `/privacy`.

- **Image:** built by Cloud Build from the `Dockerfile`, which bakes both
  models into the image. `.gcloudignore` keeps the local venv out of the upload.
- **Secrets:** `API_KEY`, `TOKEN_SECRET`, and `DATABASE_URL` (Neon Postgres)
  live in Secret Manager and are mounted as env vars. `DATABASE_URL` is pinned
  to a version, so after rotating it, redeploy with
  `--update-secrets=DATABASE_URL=DATABASE_URL:<new version>`.
- **Scaling:** min 0 / max 2 instances (2 vCPU, 4GiB). Cold starts take about
  70s because the server warms both models before serving. The Cloud Scheduler
  job `moodlens-keep-warm` pings `/` every 10 minutes to keep an instance idle
  and warm (idle instances aren't billed under request-based billing).

Deploy a new version (bump the tag each time):

```bash
gcloud builds submit --tag us-east1-docker.pkg.dev/moodlens-36dunes/moodlens/api:vN --project=moodlens-36dunes
gcloud run deploy moodlens-api --image=us-east1-docker.pkg.dev/moodlens-36dunes/moodlens/api:vN --region=us-east1 --project=moodlens-36dunes
```
