from chess_coach.pgn import clean_opening_label, opening_family, opening_variation, parse_time_control


def test_opening_label_cleanup_stops_at_move_number() -> None:
    assert clean_opening_label("Scotch-Game...4.Nxd4-Nxd4") == "Scotch Game"


def test_opening_family_and_variation() -> None:
    label = "Queens Pawn Opening Zukertort Chigorin Variation"
    assert opening_family(label) == "Queens Pawn Opening"
    assert opening_variation(label) == "Zukertort Chigorin Variation"


def test_parse_time_control() -> None:
    assert parse_time_control("60+1") == (60, 1)
    assert parse_time_control("600") == (600, 0)
    assert parse_time_control("1/86400") == (60, 0)
