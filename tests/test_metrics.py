from chess_coach.metrics import accept_game, compute_dashboard
from chess_coach.models import GameRecord


def make_record(index: int, result: str, family: str = "Italian Game") -> GameRecord:
    return GameRecord(
        url=f"https://example.com/{index}",
        end_time=1_700_000_000 + index * 60,
        time_class="bullet",
        time_control="60",
        side="white" if index % 2 else "black",
        my_rating=1000 + index,
        opp_rating=1010,
        result=result,
        opp_result="win" if result != "win" else "resigned",
        rated=True,
        rules="chess",
        plies=40,
        fullmoves=20,
        opening=family,
        eco="C50",
        family=family,
        variation="",
        first_moves="1.e4 e5 2.Nf3 Nc6",
        opening_fen="r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    )


def test_accept_game_filters_to_rated_standard_time_class() -> None:
    assert accept_game({"time_class": "bullet", "rated": True, "rules": "chess", "pgn": "x"}, "bullet")
    assert not accept_game({"time_class": "blitz", "rated": True, "rules": "chess", "pgn": "x"}, "bullet")
    assert not accept_game({"time_class": "bullet", "rated": False, "rules": "chess", "pgn": "x"}, "bullet")


def test_compute_dashboard_contains_core_sections() -> None:
    records = [
        make_record(1, "win"),
        make_record(2, "timeout", "Sicilian Defense"),
        make_record(3, "checkmated", "Sicilian Defense"),
    ]
    payload = compute_dashboard(records, username="demo", time_class="bullet", profile={}, stats={}, archive_count=1)
    assert payload["username"] == "demo"
    assert payload["recent_form"]["record"] == "1-2-0"
    assert payload["openings"][0]["games"] >= 1
    assert payload["recent_losses"]
    assert payload["move_quality"]["status"] == "deferred"
