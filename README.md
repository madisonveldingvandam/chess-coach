# Chess Coach

Generic Chess.com analytics for coaching and self-review.

Chess Coach accepts any public Chess.com handle or member profile URL, fetches
public game archives through the backend, and renders a compact dashboard for
ratings, recent form, openings, losses, process signals, and study prompts. It
does not ship with a default player.

## MVP Direction

The first implementation is local-first and hosted-compatible:

- Frontend: Vite + TypeScript, dashboard UI, Chessground board.
- Backend: FastAPI API served by Uvicorn.
- Jobs: in-process background worker for the first checkpoint.
- Storage: filesystem cache under this repo's `data/` directory.
- Analysis: public Chess.com archive fetch, PGN parsing, core metrics, observed
  repertoire/opening stats, recent losses, process signals, and recommendations.
- Stockfish: optional/deferred. The data model has an explicit move-quality
  placeholder, but the MVP does not require an engine to run.

## Why Local-First First

The unknowns are product and analysis shape, not auth or billing. A local-first
single-service app lets the dashboard, cache format, and analysis job contract
settle before committing to hosted worker infrastructure. The same FastAPI app
can later be packaged as a single container for Render, Fly.io, or Railway.

GitHub Pages alone is not enough for dynamic profile entry because analysis
requires backend work, caching, and eventually an engine/worker. Vercel can work
for the frontend, but its serverless constraints are a poor fit for long-running
Stockfish analysis and persistent filesystem caches. The likely first hosted
target is a small container host with a persistent volume.

## Run Locally

Install backend dependencies:

```bash
uv sync --group dev
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run the API:

```bash
uv run uvicorn chess_coach.main:app --reload --port 8000
```

Run the frontend in another terminal:

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173> and enter any public Chess.com handle or member
profile URL.

## Test And Build

```bash
uv run pytest
cd frontend && npm run build
```

To serve a production build from FastAPI:

```bash
cd frontend && npm run build
cd ..
uv run uvicorn chess_coach.main:app --port 8000
```

Then open <http://localhost:8000>.

## Static Dashboard Data

The static data generator is optional and requires an explicit public profile:

```bash
uv run python scripts/generate_static_dashboard.py --username chess.com/member/example --time-class blitz --max-archives 6
```

Static data can be useful for demos, but arbitrary live profile analysis
requires the FastAPI backend.

## Deploy

For the generic product, deploy the FastAPI app as a container so profile entry
works for any public Chess.com account. The included Render Blueprint uses
Docker and stores runtime cache data under `CHESS_COACH_DATA_DIR`.

GitHub Pages can host the static frontend and optionally a pre-generated sample
dashboard, but it cannot run live profile analysis by itself.

Expected project URLs after the repository is named `chess-coach`:

- <https://madisonveldingvandam.github.io/chess-coach/>
- <https://render.com/deploy?repo=https://github.com/madisonveldingvandam/chess-coach>

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
