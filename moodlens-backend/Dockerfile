# MoodLens API container. Deployed to Cloud Run, which sets PORT; the 7860
# default is only for running it locally with `docker run`.
FROM python:3.11-slim

# Non-root user; owns the model cache baked in below.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface \
    PYTHONUNBUFFERED=1 \
    PRELOAD_MODELS=1 \
    PORT=7860

WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user main.py database.py models.py schemas.py privacy.html ./

# Bake both models into the image so a cold start loads from disk instead of
# downloading ~1.5GB. Uses the app's own loaders so the cached files are
# exactly what runtime asks for. The sqlite URL only keeps the import from
# trying to reach Postgres during the build.
RUN DATABASE_URL=sqlite:////tmp/build.db python -c "import main; main.get_text_pipeline(); main.get_audio_pipeline()" \
    && rm -f /tmp/build.db

EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
