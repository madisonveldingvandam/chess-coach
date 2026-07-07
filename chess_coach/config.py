import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("CHESS_COACH_DATA_DIR", PROJECT_ROOT / "data"))
FRONTEND_DIST = Path(os.environ.get("CHESS_COACH_FRONTEND_DIST", PROJECT_ROOT / "frontend" / "dist"))

CHESSCOM_BASE = "https://api.chess.com/pub/player"
USER_AGENT = "ChessCoach/0.1 (+https://github.com/madisonveldingvandam/chess-coach)"

TIME_CLASSES = {"bullet", "blitz", "rapid", "daily"}
