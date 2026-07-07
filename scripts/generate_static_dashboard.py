from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from chess_coach.chesscom import ChessComClient
from chess_coach.config import DATA_DIR
from chess_coach.metrics import accept_game, compute_dashboard
from chess_coach.pgn import parse_game
from chess_coach.usernames import normalize_chesscom_username


def generate_static_dashboard(
    *,
    username: str,
    time_class: str,
    max_archives: int,
    output: Path,
    force: bool,
) -> dict:
    username = normalize_chesscom_username(username)
    client = ChessComClient(DATA_DIR)
    profile = client.fetch_profile(username)
    stats = client.fetch_stats(username)
    archives = client.fetch_recent_archives(username, max_archives=max_archives, force=force)

    games: list[dict] = []
    for archive in archives:
        games.extend(archive.get("games", []))

    matching_games = [game for game in games if accept_game(game, time_class)]
    records = [parse_game(game, username=username) for game in matching_games]
    payload = compute_dashboard(
        records,
        username=username,
        time_class=time_class,
        profile=profile,
        stats=stats,
        archive_count=len(archives),
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2))
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate static Chess Coach dashboard JSON.")
    parser.add_argument("--username", required=True, help="Chess.com handle or member profile URL")
    parser.add_argument("--time-class", default="blitz", choices=["bullet", "blitz", "rapid", "daily"])
    parser.add_argument("--max-archives", type=int, default=6)
    parser.add_argument("--output", type=Path, default=Path("frontend/public/data/default-dashboard.json"))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    payload = generate_static_dashboard(
        username=args.username,
        time_class=args.time_class,
        max_archives=args.max_archives,
        output=args.output,
        force=args.force,
    )
    print(
        f"Generated {args.output} for {payload['username']} "
        f"{payload['time_class']} with {payload['source']['games_used']} games."
    )


if __name__ == "__main__":
    main()
