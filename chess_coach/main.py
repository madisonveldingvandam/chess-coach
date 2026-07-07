from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import FRONTEND_DIST, TIME_CLASSES
from .jobs import JobManager
from .usernames import normalize_chesscom_username


app = FastAPI(title="Chess Coach API", version="0.1.0")
jobs = JobManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalysisRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    time_class: str = "bullet"
    max_archives: int = Field(default=3, ge=1, le=36)
    force: bool = False


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/analyses", status_code=202)
def create_analysis(request: AnalysisRequest) -> dict:
    if request.time_class not in TIME_CLASSES:
        raise HTTPException(status_code=400, detail=f"Unsupported time_class: {request.time_class}")
    try:
        username = normalize_chesscom_username(request.username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    job = jobs.start(
        username=username,
        time_class=request.time_class,
        max_archives=request.max_archives,
        force=request.force,
    )
    return job.public_dict()


@app.get("/api/analyses/{job_id}")
def get_analysis(job_id: str) -> dict:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    return job.public_dict()


@app.get("/api/results/{username}")
def get_cached_result(username: str, time_class: str = "bullet") -> dict:
    if time_class not in TIME_CLASSES:
        raise HTTPException(status_code=400, detail=f"Unsupported time_class: {time_class}")
    try:
        username = normalize_chesscom_username(username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result = jobs.cached_result(username=username, time_class=time_class)
    if result is None:
        raise HTTPException(status_code=404, detail="No cached analysis for this user and time class")
    return result


if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@app.get("/", include_in_schema=False)
def index():
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return HTMLResponse(
        """
        <!doctype html>
        <title>Chess Coach</title>
        <main style="font-family: system-ui; padding: 2rem; max-width: 720px">
          <h1>Chess Coach API is running</h1>
          <p>Build the frontend with <code>cd frontend && npm run build</code>,
          or run Vite at <code>http://localhost:5173</code>.</p>
        </main>
        """
    )


@app.get("/{path:path}", include_in_schema=False)
def spa_fallback(path: str):
    requested = (FRONTEND_DIST / path).resolve()
    dist_root = FRONTEND_DIST.resolve()
    if FRONTEND_DIST.exists() and dist_root in requested.parents and requested.exists():
        return FileResponse(requested)
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Frontend build not found")
