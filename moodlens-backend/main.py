from functools import lru_cache
from typing import List
import json
import io
import numpy as np
import librosa

from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from scipy.stats import entropy

# Absolute imports (since we run `uvicorn main:app`)
from database import SessionLocal, engine, Base
from models import HistoryEntry
from schemas import HistoryCreate, HistoryOut

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
    model_id = "superb/wav2vec2-base-superb-er"  # categorical SER (angry, happy, sad, neutral, etc.)

    # Force a consistent load path with safetensors if available.
    # (If safetensors aren't available for your local HF cache, it will fall back automatically.)
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
# -------- FastAPI app --------
app = FastAPI(title="MoodLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten later for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables on startup (good for dev; later switch to Alembic)
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def root():
    return {"status": "ok"}

# -------- Text endpoint --------
@app.post("/analyze", response_model=AnalyzeOut)
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

@app.post("/analyze-audio")
async def analyze_audio(file: UploadFile = File(...)):
    try:
        data = await file.read()

        # Decode (wav/m4a/aac). Requires ffmpeg installed.
        y, sr = librosa.load(io.BytesIO(data), sr=TARGET_SR, mono=True)
        if y.size == 0:
            raise ValueError("Empty audio")

        # Keep only speechy parts and normalize loudness
        voiced = _extract_voiced(y, sr)
        voiced_seconds = voiced.shape[0] / sr
        if voiced_seconds < 0.8:
            raise ValueError(f"Not enough speech detected ({voiced_seconds:.2f}s). Try a clearer 2–6s clip.")

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

        # Compute entropy (confidence proxy)
        H = round(_entropy(final_scores), 3)

        # Keep only top K for the client UI
        topk = final_scores[:TOPK]
        top_label = topk[0]["label"]
        top_confidence = round(topk[0]["score"] * 100.0, 1)  # percent

        resp = {
            "top_label": top_label,
            "top_confidence": top_confidence,   # <-- for "(71%)" next to label
            "scores": topk,                     # <-- only top 3 returned
            "debug": {
                "voiced_seconds": round(voiced_seconds, 2),
                "windows": len(segments),
                "entropy": H,
            },
        }

        # Add hint when distribution is too flat (low confidence)
        if H > ENTROPY_THRESHOLD:
            resp["hint"] = "Low confidence — try a clearer 2–6s clip closer to the mic."

        return resp

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Audio processing failed: {e}")

# -------- History: create + list (Postgres-backed) --------
@app.post("/history", response_model=HistoryOut)
def create_history(entry: HistoryCreate, db: Session = Depends(get_db)):
    obj = HistoryEntry(
        user_id=entry.user_id,
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

@app.get("/history", response_model=List[HistoryOut])
def list_history(user_id: str, limit: int = 50, db: Session = Depends(get_db)):
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
