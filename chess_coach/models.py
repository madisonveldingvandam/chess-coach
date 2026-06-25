from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


Side = Literal["white", "black"]


@dataclass
class GameRecord:
    url: str
    end_time: int
    time_class: str
    time_control: str
    side: Side
    my_rating: int
    opp_rating: int
    result: str
    opp_result: str
    rated: bool
    rules: str
    plies: int
    fullmoves: int
    opening: str | None
    eco: str | None
    family: str | None
    variation: str | None
    first_moves: str | None
    opening_fen: str | None
    my_clocks: list[float] = field(default_factory=list)
    opp_clocks: list[float] = field(default_factory=list)
    rating_delta: int | None = None
    session_id: int | None = None
    game_index_in_session: int | None = None
