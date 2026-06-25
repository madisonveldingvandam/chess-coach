from __future__ import annotations

import json
import re
from pathlib import Path

import httpx

from .config import CHESSCOM_BASE, USER_AGENT


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
        return self._get_json(f"{CHESSCOM_BASE}/{username.lower()}")

    def fetch_stats(self, username: str) -> dict:
        return self._get_json(f"{CHESSCOM_BASE}/{username.lower()}/stats")

    def fetch_archives_index(self, username: str) -> list[str]:
        data = self._get_json(f"{CHESSCOM_BASE}/{username.lower()}/games/archives")
        return list(data.get("archives", []))

    def fetch_archive(self, archive_url: str, *, username: str, force: bool = False) -> dict:
        cache_path = self._archive_cache_path(username, archive_url)
        if cache_path.exists() and not force:
            return json.loads(cache_path.read_text())

        data = self._get_json(archive_url)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(data, indent=2))
        return data

    def _archive_cache_path(self, username: str, archive_url: str) -> Path:
        match = _ARCHIVE_URL_RE.search(archive_url)
        if not match:
            raise ValueError(f"Not a Chess.com monthly archive URL: {archive_url}")
        year, month = match.groups()
        safe_username = username.lower().replace("/", "_")
        return self.cache_dir / "chesscom" / safe_username / "archives" / f"{year}-{month}.json"
