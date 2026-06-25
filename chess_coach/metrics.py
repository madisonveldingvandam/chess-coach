from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import statistics

from .models import GameRecord


DRAW_RESULTS = {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}


def compute_dashboard(
    records: list[GameRecord],
    *,
    username: str,
    time_class: str,
    profile: dict,
    stats: dict,
    archive_count: int,
) -> dict:
    ordered = sorted(records, key=lambda record: record.end_time)
    _enrich_rating_deltas(ordered)
    _enrich_sessions(ordered)

    return {
        "username": username,
        "time_class": time_class,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "platform": "chess.com",
            "profile_url": profile.get("url") or f"https://www.chess.com/member/{username}",
            "archives_used": archive_count,
            "games_used": len(ordered),
        },
        "ratings": _ratings(stats, ordered),
        "recent_form": _recent_form(ordered),
        "openings": _opening_families(ordered),
        "recent_losses": _recent_losses(ordered),
        "behavior": _behavior(ordered),
        "recommendations": _recommendations(ordered),
        "repertoire": {
            "mode": "observed",
            "note": "No user-defined repertoire plan is configured in the MVP.",
        },
        "move_quality": {
            "status": "deferred",
            "summary": "Stockfish analysis is intentionally optional and deferred for this MVP.",
        },
    }


def accept_game(game_data: dict, time_class: str) -> bool:
    return (
        game_data.get("time_class") == time_class
        and game_data.get("rated") is True
        and game_data.get("rules") == "chess"
        and game_data.get("pgn")
    )


def _ratings(stats: dict, records: list[GameRecord]) -> dict:
    key_by_class = {
        "bullet": "chess_bullet",
        "blitz": "chess_blitz",
        "rapid": "chess_rapid",
        "daily": "chess_daily",
    }
    by_format = {}
    for label, key in key_by_class.items():
        last = stats.get(key, {}).get("last")
        if last and last.get("rating") is not None:
            by_format[label] = last["rating"]

    current = records[-1].my_rating if records else None
    if by_format:
        current = next(iter(by_format.values())) if current is None else current

    return {"current": current, "by_format": by_format}


def _recent_form(records: list[GameRecord], window: int = 20) -> dict:
    if not records:
        return {"window": window, "games": 0, "score_pct": 0.0, "record": "0-0-0", "rating_delta": 0, "form": []}
    recent = records[-window:]
    wins = sum(1 for record in recent if _is_win(record.result))
    draws = sum(1 for record in recent if _is_draw(record.result))
    losses = len(recent) - wins - draws
    score = wins + 0.5 * draws
    rating_delta = _rating_delta(recent)
    return {
        "window": window,
        "games": len(recent),
        "score_pct": round(100 * score / len(recent), 1),
        "record": f"{wins}-{losses}-{draws}",
        "rating_delta": rating_delta,
        "form": [_result_letter(record) for record in recent[-10:]],
    }


def _opening_families(records: list[GameRecord]) -> list[dict]:
    groups: dict[tuple[str, str], list[GameRecord]] = {}
    for record in records:
        family = record.family or "Unknown opening"
        groups.setdefault((family, record.side), []).append(record)

    rows = []
    for (family, side), group in groups.items():
        group = sorted(group, key=lambda record: record.end_time)
        wins = sum(1 for record in group if _is_win(record.result))
        draws = sum(1 for record in group if _is_draw(record.result))
        losses = len(group) - wins - draws
        loss_records = [record for record in group if _is_loss(record.result)]
        timeout_losses = sum(1 for record in loss_records if record.result == "timeout")
        mate_losses = sum(1 for record in loss_records if record.result == "checkmated")
        eco = _most_common(record.eco for record in group if record.eco)
        representative = _most_common(record.opening_fen for record in group if record.opening_fen)
        rows.append(
            {
                "family": family,
                "side": side,
                "eco": eco,
                "games": len(group),
                "record": f"{wins}-{losses}-{draws}",
                "win_pct": round(100 * wins / len(group), 1),
                "score_pct": round(100 * (wins + 0.5 * draws) / len(group), 1),
                "rating_delta": _rating_delta(group),
                "avg_opp_rating": round(statistics.mean(record.opp_rating for record in group)),
                "timeout_losses": timeout_losses,
                "mate_losses": mate_losses,
                "form": [_result_letter(record) for record in group[-10:]],
                "representative_fen": representative,
                "sample_moves": next((record.first_moves for record in reversed(group) if record.first_moves), None),
                "priority": _study_priority(group, records),
            }
        )
    rows.sort(key=lambda row: (-row["priority"], -row["games"], row["family"]))
    return rows


def _recent_losses(records: list[GameRecord], limit: int = 12) -> list[dict]:
    losses = [record for record in records if _is_loss(record.result)]
    rows = []
    for record in sorted(losses, key=lambda item: item.end_time, reverse=True)[:limit]:
        final_clock = record.my_clocks[-1] if record.my_clocks else None
        rows.append(
            {
                "url": record.url,
                "date": datetime.fromtimestamp(record.end_time, timezone.utc).date().isoformat(),
                "opening": record.opening or "Unknown opening",
                "family": record.family or "Unknown opening",
                "side": record.side,
                "loss_type": record.result,
                "moves": record.fullmoves,
                "final_clock": round(final_clock, 1) if final_clock is not None else None,
                "rating_delta": record.rating_delta,
                "opponent_rating": record.opp_rating,
                "opening_fen": record.opening_fen,
                "review_prompt": _loss_prompt(record),
            }
        )
    return rows


def _behavior(records: list[GameRecord]) -> dict:
    recent = records[-30:]
    losses = [record for record in recent if _is_loss(record.result)]
    timeout_losses = [record for record in losses if record.result == "timeout"]
    mate_losses = [record for record in losses if record.result == "checkmated"]
    sessions = _sessions(records)
    process = _process_signals(recent)
    return {
        "sample_games": len(recent),
        "loss_rate_pct": round(100 * len(losses) / len(recent), 1) if recent else 0.0,
        "timeout_loss_pct": round(100 * len(timeout_losses) / len(losses), 1) if losses else 0.0,
        "mate_loss_pct": round(100 * len(mate_losses) / len(losses), 1) if losses else 0.0,
        "longest_recent_loss_streak": _longest_loss_streak(recent),
        "sessions": sessions[-8:],
        "process": process,
    }


def _recommendations(records: list[GameRecord]) -> list[dict]:
    if not records:
        return [
            {
                "title": "Analyze a public Chess.com handle",
                "reason": "No rated standard games were found for the selected time class.",
                "action": "Try a different time class or increase the archive window.",
            }
        ]

    recommendations: list[dict] = []
    openings = _opening_families(records)
    weak_openings = [row for row in openings if row["games"] >= 3 and row["score_pct"] < 45]
    if weak_openings:
        row = weak_openings[0]
        recommendations.append(
            {
                "title": f"Study {row['family']} as {row['side']}",
                "reason": f"{row['games']} games, {row['score_pct']}% score, {row['rating_delta']} rating delta.",
                "action": "Review the first recurring position and choose one default response.",
            }
        )

    behavior = _behavior(records)
    if behavior["timeout_loss_pct"] >= 35:
        recommendations.append(
            {
                "title": "Tighten clock process",
                "reason": f"{behavior['timeout_loss_pct']}% of recent losses are timeouts.",
                "action": "Review move-10 reserve and stop playing when the clock process collapses.",
            }
        )
    if behavior["mate_loss_pct"] >= 35:
        recommendations.append(
            {
                "title": "Run a safety review",
                "reason": f"{behavior['mate_loss_pct']}% of recent losses are checkmates.",
                "action": "Review the last two mate losses and tag the missed threat.",
            }
        )

    latest_loss = next((record for record in reversed(records) if _is_loss(record.result)), None)
    if latest_loss is not None:
        recommendations.append(
            {
                "title": "Review the latest loss",
                "reason": f"{latest_loss.result} in {latest_loss.opening or 'an unknown opening'}.",
                "action": _loss_prompt(latest_loss),
            }
        )

    return recommendations[:4]


def _process_signals(records: list[GameRecord]) -> dict:
    move_10 = [record.my_clocks[9] for record in records if len(record.my_clocks) > 9]
    move_20 = [record.my_clocks[19] for record in records if len(record.my_clocks) > 19]
    return {
        "median_clock_move_10": round(statistics.median(move_10), 1) if move_10 else None,
        "median_clock_move_20": round(statistics.median(move_20), 1) if move_20 else None,
        "games_with_clock_data": sum(1 for record in records if record.my_clocks),
    }


def _sessions(records: list[GameRecord], gap_seconds: int = 600) -> list[dict]:
    if not records:
        return []
    sessions: list[list[GameRecord]] = []
    current = [records[0]]
    for record in records[1:]:
        if record.end_time - current[-1].end_time > gap_seconds:
            sessions.append(current)
            current = []
        current.append(record)
    sessions.append(current)

    rows = []
    for session in sessions:
        wins = sum(1 for record in session if _is_win(record.result))
        draws = sum(1 for record in session if _is_draw(record.result))
        losses = len(session) - wins - draws
        rows.append(
            {
                "start": datetime.fromtimestamp(session[0].end_time, timezone.utc).isoformat(),
                "games": len(session),
                "record": f"{wins}-{losses}-{draws}",
                "rating_delta": _rating_delta(session),
                "duration_minutes": round((session[-1].end_time - session[0].end_time) / 60, 1),
                "tilt_flag": _rating_delta(session) <= -40,
            }
        )
    return rows


def _enrich_rating_deltas(records: list[GameRecord]) -> None:
    previous = None
    for record in records:
        record.rating_delta = None if previous is None else record.my_rating - previous.my_rating
        previous = record


def _enrich_sessions(records: list[GameRecord], gap_seconds: int = 600) -> None:
    session_id = 0
    index = 1
    previous = None
    for record in records:
        if previous is not None and record.end_time - previous.end_time > gap_seconds:
            session_id += 1
            index = 1
        record.session_id = session_id
        record.game_index_in_session = index
        index += 1
        previous = record


def _rating_delta(records: list[GameRecord]) -> int:
    deltas = [record.rating_delta for record in records if record.rating_delta is not None]
    return int(sum(deltas))


def _study_priority(group: list[GameRecord], all_records: list[GameRecord]) -> float:
    if not group or not all_records:
        return 0.0
    wins = sum(1 for record in group if _is_win(record.result))
    draws = sum(1 for record in group if _is_draw(record.result))
    score_pct = 100 * (wins + 0.5 * draws) / len(group)
    all_wins = sum(1 for record in all_records if _is_win(record.result))
    all_draws = sum(1 for record in all_records if _is_draw(record.result))
    baseline = 100 * (all_wins + 0.5 * all_draws) / len(all_records)
    underperformance = max(0.0, baseline - score_pct)
    return round(len(group) * underperformance, 2)


def _longest_loss_streak(records: list[GameRecord]) -> int:
    longest = 0
    current = 0
    for record in records:
        if _is_loss(record.result):
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def _loss_prompt(record: GameRecord) -> str:
    if record.result == "timeout":
        return "Find the first move where clock pressure changed the decision."
    if record.result == "checkmated":
        return "Find the first opponent move that created the mating threat."
    return "Find the first move where the position became hard to defend."


def _most_common(values) -> str | None:
    counter = Counter(value for value in values if value)
    return counter.most_common(1)[0][0] if counter else None


def _result_letter(record: GameRecord) -> str:
    if _is_win(record.result):
        return "W"
    if _is_draw(record.result):
        return "D"
    return "L"


def _is_win(result: str) -> bool:
    return result == "win"


def _is_draw(result: str) -> bool:
    return result in DRAW_RESULTS


def _is_loss(result: str) -> bool:
    return not _is_win(result) and not _is_draw(result)
