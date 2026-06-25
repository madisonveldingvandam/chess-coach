from __future__ import annotations

from io import StringIO
import re

import chess.pgn

from .models import GameRecord


_CLOCK_RE = re.compile(r"\[%clk (\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]")
_ECO_URL_RE = re.compile(r'\[ECOUrl "https://www\.chess\.com/openings/([^"]+)"\]')
_ECO_RE = re.compile(r'\[ECO "([^"]+)"\]')
_FAMILY_STOPS = {
    "Variation",
    "Defense",
    "Attack",
    "System",
    "Gambit",
    "Game",
    "Opening",
    "Accepted",
    "Declined",
}


def parse_time_control(time_control: str) -> tuple[int, int]:
    if "+" in time_control:
        start, inc = time_control.split("+", 1)
        try:
            return int(start), int(inc)
        except ValueError:
            return 60, 0
    try:
        return int(time_control), 0
    except ValueError:
        return 60, 0


def clean_opening_label(slug_or_label: str | None) -> str | None:
    if not slug_or_label:
        return None
    name = slug_or_label.replace("-", " ")
    parts: list[str] = []
    for token in re.split(r"\s+|\.{3}", name):
        if not token:
            continue
        if re.match(r"^\d", token):
            break
        parts.append(token)
    return " ".join(parts) if parts else name


def opening_family(label: str | None) -> str | None:
    cleaned = clean_opening_label(label)
    if not cleaned:
        return cleaned
    tokens = cleaned.split()
    for index, token in enumerate(tokens):
        if index > 0 and token in _FAMILY_STOPS:
            return " ".join(tokens[: index + 1])
    return " ".join(tokens)


def opening_variation(label: str | None) -> str | None:
    cleaned = clean_opening_label(label)
    if not cleaned:
        return cleaned
    tokens = cleaned.split()
    for index, token in enumerate(tokens):
        if index > 0 and token in _FAMILY_STOPS:
            return " ".join(tokens[index + 1 :])
    return ""


def parse_game(game_data: dict, *, username: str, opening_plies: int = 10) -> GameRecord:
    me_white = game_data["white"]["username"].lower() == username.lower()
    me = game_data["white"] if me_white else game_data["black"]
    opponent = game_data["black"] if me_white else game_data["white"]
    side = "white" if me_white else "black"

    pgn = game_data.get("pgn", "")
    game = chess.pgn.read_game(StringIO(pgn))
    plies = 0
    first_moves = None
    opening_fen = None

    if game is not None:
        board = game.board()
        san_parts: list[str] = []
        for move in game.mainline_moves():
            san = board.san(move)
            if plies < opening_plies:
                if board.turn == chess.WHITE:
                    san_parts.append(f"{board.fullmove_number}.{san}")
                else:
                    san_parts.append(san)
            board.push(move)
            plies += 1
            if plies == min(opening_plies, 8):
                opening_fen = board.fen()
        if san_parts:
            first_moves = " ".join(san_parts)
        if opening_fen is None:
            opening_fen = board.fen()

    fullmoves = (plies + 1) // 2
    all_clocks = _parse_clocks(pgn)
    white_clocks = all_clocks[0::2]
    black_clocks = all_clocks[1::2]

    eco_url_match = _ECO_URL_RE.search(pgn)
    opening = clean_opening_label(eco_url_match.group(1)) if eco_url_match else None
    eco_match = _ECO_RE.search(pgn)
    eco = eco_match.group(1) if eco_match else None

    return GameRecord(
        url=game_data.get("url", ""),
        end_time=int(game_data["end_time"]),
        time_class=game_data.get("time_class", ""),
        time_control=str(game_data.get("time_control", "")),
        side=side,
        my_rating=int(me.get("rating", 0)),
        opp_rating=int(opponent.get("rating", 0)),
        result=me.get("result", ""),
        opp_result=opponent.get("result", ""),
        rated=bool(game_data.get("rated", False)),
        rules=game_data.get("rules", ""),
        plies=plies,
        fullmoves=fullmoves,
        opening=opening,
        eco=eco,
        family=opening_family(opening),
        variation=opening_variation(opening),
        first_moves=first_moves,
        opening_fen=opening_fen,
        my_clocks=white_clocks if me_white else black_clocks,
        opp_clocks=black_clocks if me_white else white_clocks,
    )


def _parse_clocks(pgn: str) -> list[float]:
    clocks: list[float] = []
    for hours, minutes, seconds in _CLOCK_RE.findall(pgn):
        clocks.append(int(hours) * 3600 + int(minutes) * 60 + float(seconds))
    return clocks
