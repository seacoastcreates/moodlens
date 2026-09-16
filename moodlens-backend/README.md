# MoodLens Backend

FastAPI + Hugging Face emotion classifier.

## Testing

```bash
pip install -r requirements-dev.txt
pytest
```

Tests use a throwaway sqlite file (not the dev Postgres database) and mock
the Hugging Face pipelines, so they don't require model downloads or a
running Postgres instance.
