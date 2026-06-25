from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from threading import Lock
from uuid import uuid4

from .chesscom import ChessComClient
from .config import DATA_DIR
from .metrics import accept_game, compute_dashboard
from .pgn import parse_game


@dataclass
class AnalysisJob:
    id: str
    username: str
    time_class: str
    max_archives: int
    force: bool
    status: str = "queued"
    message: str = "Queued"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    result: dict | None = None
    error: str | None = None

    def public_dict(self) -> dict:
        return asdict(self)


class JobManager:
    def __init__(self, data_dir: Path = DATA_DIR):
        self.data_dir = Path(data_dir)
        self.client = ChessComClient(self.data_dir)
        self.executor = ThreadPoolExecutor(max_workers=2)
        self.jobs: dict[str, AnalysisJob] = {}
        self.lock = Lock()

    def start(self, *, username: str, time_class: str, max_archives: int, force: bool) -> AnalysisJob:
        job = AnalysisJob(
            id=uuid4().hex,
            username=username.strip(),
            time_class=time_class,
            max_archives=max(1, min(max_archives, 36)),
            force=force,
        )
        with self.lock:
            self.jobs[job.id] = job
        self.executor.submit(self._run, job.id)
        return job

    def get(self, job_id: str) -> AnalysisJob | None:
        with self.lock:
            return self.jobs.get(job_id)

    def cached_result(self, *, username: str, time_class: str) -> dict | None:
        path = self._result_path(username, time_class)
        if not path.exists():
            return None
        return json.loads(path.read_text())

    def _run(self, job_id: str) -> None:
        job = self.get(job_id)
        if job is None:
            return
        try:
            self._mark(job, "running", "Fetching Chess.com profile and archive index")
            profile = self.client.fetch_profile(job.username)
            stats = self.client.fetch_stats(job.username)
            archive_urls = self.client.fetch_archives_index(job.username)
            selected = archive_urls[-job.max_archives :]

            all_games: list[dict] = []
            for index, archive_url in enumerate(selected, start=1):
                self._mark(job, "running", f"Fetching archive {index} of {len(selected)}")
                archive = self.client.fetch_archive(archive_url, username=job.username, force=job.force)
                all_games.extend(archive.get("games", []))

            self._mark(job, "running", "Parsing games and computing metrics")
            matching_games = [game for game in all_games if accept_game(game, job.time_class)]
            records = [parse_game(game, username=job.username) for game in matching_games]
            payload = compute_dashboard(
                records,
                username=job.username,
                time_class=job.time_class,
                profile=profile,
                stats=stats,
                archive_count=len(selected),
            )

            path = self._result_path(job.username, job.time_class)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, indent=2))
            self._complete(job, payload)
        except Exception as exc:
            self._fail(job, str(exc))

    def _result_path(self, username: str, time_class: str) -> Path:
        safe_username = username.lower().replace("/", "_")
        return self.data_dir / "results" / safe_username / f"{time_class}.json"

    def _mark(self, job: AnalysisJob, status: str, message: str) -> None:
        with self.lock:
            job.status = status
            job.message = message
            job.updated_at = datetime.now(timezone.utc).isoformat()

    def _complete(self, job: AnalysisJob, result: dict) -> None:
        with self.lock:
            job.status = "complete"
            job.message = "Analysis complete"
            job.result = result
            job.updated_at = datetime.now(timezone.utc).isoformat()

    def _fail(self, job: AnalysisJob, error: str) -> None:
        with self.lock:
            job.status = "failed"
            job.message = "Analysis failed"
            job.error = error
            job.updated_at = datetime.now(timezone.utc).isoformat()
