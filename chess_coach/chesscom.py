from __future__ import annotations

import json
import re
from pathlib import Path

import httpx

from .config import CHESSCOM_BASE, USER_AGENT
from .usernames import normalize_chesscom_username


_ARCHIVE_URL_RE = re.compile(r"/games/(\d{4})/(\d{2})$")


class ChessComClient:
    def __init__(self, cache_dir: Path):
        self.cache_dir = Path(cache_dir)
        self.headers = {"User-Agent": USER_AGENT}

    def _get_json(self, url: str) -> dict:
        with httpx.Client(headers=self.headers, timeout=30.0, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            return response.json()

    def fetch_profile(self, username: str) -> dict:
        username = normalize_chesscom_username(username)
        return self._get_json(f"{CHESSCOM_BASE}/{username}")

    def fetch_stats(self, username: str) -> dict:
        username = normalize_chesscom_username(username)
        return self._get_json(f"{CHESSCOM_BASE}/{username}/stats")

    def fetch_archives_index(self, username: str) -> list[str]:
        username = normalize_chesscom_username(username)
        data = self._get_json(f"{CHESSCOM_BASE}/{username}/games/archives")
        return list(data.get("archives", []))

    def fetch_archive(self, archive_url: str, *, username: str, force: bool = False) -> dict:
        cache_path = self._archive_cache_path(username, archive_url)
        if cache_path.exists() and not force:
            return json.loads(cache_path.read_text())

        data = self._get_json(archive_url)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(data, indent=2))
        return data

    def fetch_recent_archives(self, username: str, *, max_archives: int, force: bool = False) -> list[dict]:
        username = normalize_chesscom_username(username)
        archives: list[dict] = []
        for archive_url in reversed(self.fetch_archives_index(username)):
            try:
                archive = self.fetch_archive(archive_url, username=username, force=force)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    continue
                raise
            archives.append(archive)
            if len(archives) >= max(1, max_archives):
                break
        return list(reversed(archives))

    def _archive_cache_path(self, username: str, archive_url: str) -> Path:
        match = _ARCHIVE_URL_RE.search(archive_url)
        if not match:
            raise ValueError(f"Not a Chess.com monthly archive URL: {archive_url}")
        year, month = match.groups()
        safe_username = normalize_chesscom_username(username)
        return self.cache_dir / "chesscom" / safe_username / "archives" / f"{year}-{month}.json"
