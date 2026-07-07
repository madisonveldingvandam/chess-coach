import pytest

from chess_coach.usernames import normalize_chesscom_username


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("Hikaru", "hikaru"),
        ("@Hikaru", "hikaru"),
        ("https://www.chess.com/member/Hikaru", "hikaru"),
        ("http://chess.com/member/Hikaru/", "hikaru"),
        ("www.chess.com/member/Hikaru?ref=profile", "hikaru"),
        ("chess.com/member/Hikaru#games", "hikaru"),
    ],
)
def test_normalize_chesscom_username(value: str, expected: str) -> None:
    assert normalize_chesscom_username(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "",
        "https://www.chess.com/stats/player/hikaru",
        "https://example.com/member/hikaru",
        "bad/user",
        "name with spaces",
    ],
)
def test_normalize_chesscom_username_rejects_invalid_input(value: str) -> None:
    with pytest.raises(ValueError):
        normalize_chesscom_username(value)
