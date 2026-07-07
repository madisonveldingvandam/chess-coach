from __future__ import annotations

import re
from urllib.parse import urlparse


_USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_CHESSCOM_URL_RE = re.compile(r"^(https?://)?(www\.)?chess\.com/", re.IGNORECASE)
_CHESSCOM_HOSTS = {"chess.com", "www.chess.com"}


def normalize_chesscom_username(value: str) -> str:
    raw = value.strip()
    if not raw:
        raise ValueError("Chess.com username is required")

    username = _username_from_profile_url(raw) if _CHESSCOM_URL_RE.match(raw) else raw.strip("/")
    username = username.strip().lstrip("@")
    if not _USERNAME_RE.fullmatch(username):
        raise ValueError("Enter a valid Chess.com handle or member profile URL")
    return username.lower()


def _username_from_profile_url(value: str) -> str:
    url_value = value if "://" in value else f"https://{value}"
    parsed = urlparse(url_value)
    if parsed.netloc.lower() not in _CHESSCOM_HOSTS:
        raise ValueError("Enter a valid Chess.com member profile URL")

    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2 or parts[0].lower() != "member":
        raise ValueError("Enter a Chess.com member profile URL")
    return parts[1]
