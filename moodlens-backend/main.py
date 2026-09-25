from functools import lru_cache
from typing import List, Optional
import hashlib
import hmac
import json
import logging
import io
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
import numpy as np
import librosa

from fastapi import FastAPI, Depends, Header, Request, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from scipy.stats import entropy

# Absolute imports (since we run `uvicorn main:app`)
from database import SessionLocal, engine, Base
from models import HistoryEntry
from schemas import HistoryCreate, HistoryOut

logger = logging.getLogger("moodlens")
logging.basicConfig(level=logging.INFO)

# -------- API key gate --------
# Shared-secret auth: keeps randoms on the LAN/internet from reading or
# writing journal data. Not per-user auth - every client uses the same key.
API_KEY = os.getenv("API_KEY")

def require_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="Server misconfigured: API_KEY is not set")
    if not x_api_key or not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Missing or invalid API key")

# -------- Per-device auth --------
# The API key above is the same for every install (it's bundled in the app's
# JS in plaintext), so it only proves "this is the real app," not "this is a
# specific user." Without more, any client that knows or guesses another
# user's user_id string could request that user's whole history.
#
# Fix: user_id is never client-supplied. /register mints a fresh random
# user_id and hands back a token binding the two together via HMAC. Every
# /history request must present that token, and the server derives user_id
# from the *verified* token - never from a request parameter - so a request
# can only ever read or write its own history.
TOKEN_SECRET = os.getenv("TOKEN_SECRET")

class RegisterOut(BaseModel):
    user_id: str
    token: str

def _sign_user_id(user_id: str) -> str:
    mac = hmac.new(TOKEN_SECRET.encode(), user_id.encode(), hashlib.sha256).hexdigest()
    return f"{user_id}.{mac}"

def _verify_token(token: str) -> Optional[str]:
    try:
        user_id, mac = token.rsplit(".", 1)
    except ValueError:
        return None
    expected = hmac.new(TOKEN_SECRET.encode(), user_id.encode(), hashlib.sha256).hexdigest()
    if not secrets.compare_digest(mac, expected):
        return None
    return user_id

def require_user(authorization: Optional[str] = Header(default=None)) -> str:
    if not TOKEN_SECRET:
        raise HTTPException(status_code=500, detail="Server misconfigured: TOKEN_SECRET is not set")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid bearer token")
    user_id = _verify_token(authorization[len("Bearer "):])
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing or invalid bearer token")
    return user_id

# -------- Rate limit (analyze endpoints) --------
# Each analyze call is expensive CPU inference, and the API key ships inside
# the app, so anyone could extract it and hammer these. Per-IP sliding window,
# in memory per instance - approximate with >1 instance, but enough to keep a
# single abusive client from starving everyone else.
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "20"))
_recent_calls: dict[str, deque] = defaultdict(deque)
_rate_lock = threading.Lock()

def rate_limit(request: Request):
    # Cloud Run's front end appends the real client IP to X-Forwarded-For, so
    # use the last entry - earlier ones are client-supplied and spoofable.
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[-1].strip() or (request.client.host if request.client else "unknown")
    now = time.monotonic()
    with _rate_lock:
        calls = _recent_calls[ip]
        while calls and now - calls[0] > 60:
            calls.popleft()
        if len(calls) >= RATE_LIMIT_PER_MINUTE:
            raise HTTPException(status_code=429, detail="Too many requests. Please wait a minute and try again.")
        calls.append(now)

# -------- Text sentiment / emotion --------
@lru_cache(maxsize=1)
def get_text_pipeline():
    from transformers import pipeline
    model_id = "SamLowe/roberta-base-go_emotions"
    return pipeline(
        "text-classification",
        model=model_id,
        return_all_scores=True,
        top_k=None,
        model_kwargs={"use_safetensors": True},
    )

class AnalyzeIn(BaseModel):
    text: str

# NOTE: Local Score model is for /analyze response only
class Score(BaseModel):
    label: str
    score: float

class AnalyzeOut(BaseModel):
    top_label: str
    scores: List[Score]

# -------- Audio emotion (optional, used by your Voice flow) --------
@lru_cache(maxsize=1)
def get_audio_pipeline():
    from transformers import (
        pipeline,
        AutoConfig,
        AutoModelForAudioClassification,
        AutoFeatureExtractor,
    )
    # UPDATED: 8-class RAVDESS model
    model_id = "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"

    config = AutoConfig.from_pretrained(model_id, use_safetensors=True)
    feature_extractor = AutoFeatureExtractor.from_pretrained(model_id)
    model = AutoModelForAudioClassification.from_pretrained(
        model_id,
        config=config,
        use_safetensors=True,
    )

    return pipeline(
        task="audio-classification",
        model=model,
        feature_extractor=feature_extractor,
        top_k=None,  # return full distribution
    )

# Map 8 audio labels -> your text label space (GoEmotions-compatible)
AUDIO2TEXT = {
    "angry": "anger",
    "fearful": "fear",
    "happy": "joy",
    "sad": "sadness",
    "neutral": "neutral",
    "calm": "neutral",       # merge with neutral
    "disgust": "disgust",
    "surprised": "surprise",
}

def _map_to_text_space(scores: list[dict]) -> list[dict]:
    """
    Merge/rename the audio model's labels into your text label set.
    Input: [{"label": "...", "score": float}, ...] over the 8 audio labels.
    Output: same structure but only text labels (merged & renormalized).
    """
    if not scores:
        return scores
    bucket = {}
    for d in scores:
        tlabel = AUDIO2TEXT.get(d["label"], d["label"])
        bucket[tlabel] = bucket.get(tlabel, 0.0) + float(d["score"])
    total = sum(bucket.values()) or 1.0
    merged = [{"label": k, "score": v / total} for k, v in bucket.items()]
    merged.sort(key=lambda x: x["score"], reverse=True)
    return merged

# -------- FastAPI app --------
app = FastAPI(title="MoodLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # no cookies/credentials are used, so a wildcard is fine
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables on startup (good for dev; later switch to Alembic)
Base.metadata.create_all(bind=engine)

# In the deployed container, load both models - and run one throwaway
# inference through each - before serving. Loading alone isn't enough: the
# weights are memory-mapped, so on Cloud Run the first real forward pass was
# what actually pulled ~1GB off disk (a 55s first voice request vs ~4s after).
# Off by default so tests and local --reload stay fast.
@app.on_event("startup")
def preload_models():
    if os.getenv("PRELOAD_MODELS") == "1":
        get_text_pipeline()("warm up")
        silence = np.zeros(int(0.8 * TARGET_SR), dtype=np.float32)
        get_audio_pipeline()({"array": silence, "sampling_rate": TARGET_SR})
        _extract_voiced(silence, TARGET_SR)  # first librosa call JIT-compiles

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def root():
    return {"status": "ok"}

# Public (no API key): App Store Connect needs a privacy policy URL, and
# serving it from the API avoids hosting a separate site.
PRIVACY_HTML = Path(__file__).resolve().parent / "privacy.html"

@app.get("/privacy", response_class=HTMLResponse)
def privacy():
    return PRIVACY_HTML.read_text(encoding="utf-8")

@app.post("/register", response_model=RegisterOut, dependencies=[Depends(require_api_key)])
def register():
    if not TOKEN_SECRET:
        raise HTTPException(status_code=500, detail="Server misconfigured: TOKEN_SECRET is not set")
    user_id = secrets.token_urlsafe(16)
    return {"user_id": user_id, "token": _sign_user_id(user_id)}

# -------- Text endpoint --------
@app.post("/analyze", response_model=AnalyzeOut, dependencies=[Depends(require_api_key), Depends(rate_limit)])
def analyze(payload: AnalyzeIn):
    nlp = get_text_pipeline()
    outputs = nlp(payload.text)[0]  # list of {label, score}
    scores_sorted = sorted(outputs, key=lambda x: x["score"], reverse=True)
    return {"top_label": scores_sorted[0]["label"], "scores": scores_sorted}

# -------- Audio endpoint (used by your HomeScreen voice flow) --------

TARGET_SR = 16000
TARGET_RMS = 0.03
MAX_VOICED_SECONDS = 6.0
TOPK = 3
ENTROPY_THRESHOLD = 1.7

def _loudness_normalize(y: np.ndarray, target_rms: float = TARGET_RMS) -> np.ndarray:
    rms = np.sqrt(np.mean(np.square(y)) + 1e-12)
    if rms < 1e-6:
        return y
    y = y * (target_rms / rms)
    return np.clip(y, -1.0, 1.0).astype(np.float32)

def _extract_voiced(y: np.ndarray, sr: int, top_db: int = 30) -> np.ndarray:
    intervals = librosa.effects.split(y, top_db=top_db)
    if len(intervals) == 0:
        return np.array([], dtype=np.float32)
    voiced = np.concatenate([y[s:e] for (s, e) in intervals]).astype(np.float32)
    max_len = int(MAX_VOICED_SECONDS * sr)
    if voiced.shape[0] > max_len:
        voiced = voiced[:max_len]
    return voiced

def _segment(y: np.ndarray, sr: int, win_s: float = 0.8, hop_s: float = 0.4) -> list[np.ndarray]:
    win = int(win_s * sr)
    hop = int(hop_s * sr)
    if y.shape[0] <= win:
        return [y]
    segs = []
    for start in range(0, max(1, y.shape[0] - win + 1), hop):
        segs.append(y[start:start+win])
    return segs

def _avg_and_sharpen(score_lists: list[list[dict]], temp: float = 0.7) -> list[dict]:
    """
    score_lists: list over windows, each is a list of {"label": str, "score": float}
    Returns a single list of {"label", "score"} averaged & temperature-sharpened.
    """
    if not score_lists:
        return []
    # Collect all labels
    labels = [d["label"] for d in score_lists[0]]
    sums = {lab: 0.0 for lab in labels}
    n = len(score_lists)
    for window_scores in score_lists:
        # ensure same label order (HF usually is stable)
        for d in window_scores:
            sums[d["label"]] += float(d["score"])
    # average
    avg = {lab: (sums[lab] / n) for lab in labels}
    # temperature sharpen in log-space
    eps = 1e-12
    # approximate logits by log(prob)
    logits = {lab: np.log(max(avg[lab], eps)) for lab in labels}
    # divide by temperature < 1 to sharpen
    for lab in labels:
        logits[lab] = logits[lab] / max(temp, 1e-6)
    # softmax back
    exps = {lab: np.exp(logits[lab]) for lab in labels}
    Z = sum(exps.values()) + eps
    out = [{"label": lab, "score": float(exps[lab] / Z)} for lab in labels]
    # sort high to low
    out.sort(key=lambda x: x["score"], reverse=True)
    return out

def _entropy(scores: list[dict]) -> float:
    eps = 1e-12
    p = np.array([max(s["score"], eps) for s in scores], dtype=np.float64)
    return float(-np.sum(p * np.log(p)))

class UnusableClip(ValueError):
    """A problem with the recording itself; its message is safe to show users."""

@app.post("/analyze-audio", dependencies=[Depends(require_api_key), Depends(rate_limit)])
async def analyze_audio(file: UploadFile = File(...)):
    try:
        data = await file.read()

        # Decode (wav/m4a/aac). Requires ffmpeg installed.
        y, sr = librosa.load(io.BytesIO(data), sr=TARGET_SR, mono=True)
        if y.size == 0:
            raise UnusableClip("That recording was empty. Try recording again.")

        # Keep only speechy parts and normalize loudness
        voiced = _extract_voiced(y, sr)
        voiced_seconds = voiced.shape[0] / sr
        if voiced_seconds < 0.8:
            raise UnusableClip("Not enough speech detected. Try a clearer 2–6 second clip, closer to the mic.")

        voiced = _loudness_normalize(voiced, TARGET_RMS)

        # Windowed inference
        segments = _segment(voiced, sr, win_s=0.8, hop_s=0.4)
        pipe = get_audio_pipeline()

        per_window_scores: list[list[dict]] = []
        for seg in segments:
            outputs = pipe({"array": seg, "sampling_rate": sr})
            outputs_sorted = sorted(outputs, key=lambda x: x["score"], reverse=True)
            per_window_scores.append(outputs_sorted)

        # Average across windows and sharpen a bit
        final_scores = _avg_and_sharpen(per_window_scores, temp=0.7)
        if not final_scores:
            raise ValueError("No scores produced")

        # NEW: map the 8-class audio labels into your text label space
        final_scores = _map_to_text_space(final_scores)

        # Compute entropy (confidence proxy)
        H = round(_entropy(final_scores), 3)

        # Keep only top K for the client UI
        topk = final_scores[:TOPK]
        top_label = topk[0]["label"]
        top_confidence = round(topk[0]["score"] * 100.0, 1)

        resp = {
            "top_label": top_label,
            "top_confidence": top_confidence,   # <-- for "(71%)" next to label
            "scores": topk,                     # <-- only top 3 returned
        }
        logger.info(
            "analyze-audio voiced_seconds=%.2f windows=%d entropy=%.3f",
            voiced_seconds, len(segments), H,
        )

        # Add hint when distribution is too flat (low confidence)
        if H > ENTROPY_THRESHOLD:
            resp["hint"] = "Low confidence — try a clearer 2–6s clip closer to the mic."

        return resp

    except UnusableClip as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        # Internals (decoder errors, model failures) go to the server log, not
        # the client.
        logger.exception("analyze-audio failed")
        raise HTTPException(status_code=400, detail="We couldn't process that recording. Try recording again.")

# -------- History: create + list (Postgres-backed) --------
@app.post("/history", response_model=HistoryOut, dependencies=[Depends(require_api_key)])
def create_history(
    entry: HistoryCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(require_user),
):
    obj = HistoryEntry(
        user_id=user_id,
        mode=entry.mode,
        text=entry.text,
        file_url=entry.file_url,
        top_label=entry.top_label,
        scores_json=json.dumps([s.model_dump() for s in entry.scores]),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return HistoryOut(
        id=obj.id,
        user_id=obj.user_id,
        mode=obj.mode,
        text=obj.text,
        file_url=obj.file_url,
        top_label=obj.top_label,
        scores=json.loads(obj.scores_json),
        created_at=obj.created_at.isoformat() if obj.created_at else "",
    )

@app.delete("/history", dependencies=[Depends(require_api_key)])
def delete_history(
    db: Session = Depends(get_db),
    user_id: str = Depends(require_user),
):
    # "Delete my data": removes every entry this device's token owns. Scoped
    # by the verified token like the other /history routes, so it can never
    # touch another user's rows.
    deleted = db.query(HistoryEntry).filter(HistoryEntry.user_id == user_id).delete()
    db.commit()
    return {"deleted": deleted}

@app.get("/history", response_model=List[HistoryOut], dependencies=[Depends(require_api_key)])
def list_history(
    limit: int = 50,
    db: Session = Depends(get_db),
    user_id: str = Depends(require_user),
):
    q = (
        db.query(HistoryEntry)
        .filter(HistoryEntry.user_id == user_id)
        .order_by(HistoryEntry.created_at.desc())
        .limit(limit)
    )
    rows = q.all()
    return [
        HistoryOut(
            id=r.id,
            user_id=r.user_id,
            mode=r.mode,
            text=r.text,
            file_url=r.file_url,
            top_label=r.top_label,
            scores=json.loads(r.scores_json),
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]
