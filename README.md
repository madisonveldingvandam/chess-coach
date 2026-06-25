# Chess Coach

General-purpose Chess.com analytics for coaching and self-review.

This is a standalone project. It does not import, symlink, call, or depend on
the older personal `chess-tracker` repo. The old project was inspected only as
source material.

## MVP Direction

The first implementation is local-first and hosted-compatible:

- Frontend: Vite + TypeScript, minimal dashboard UI, Chessground board.
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

GitHub Pages alone is not enough for the dynamic handle-entry product because
analysis requires backend work, caching, and eventually an engine/worker. Vercel
can work for the frontend, but its serverless constraints are a poor fit for
long-running Stockfish analysis and persistent filesystem caches. The likely
first hosted target is a small container host with a persistent volume.

## Old App Reuse Decision

Copied directly:

- Nothing from the old repo is copied directly in this checkpoint.

Copied then adapted, now owned here:

- Chess.com archive/cache concept.
- PGN parsing needs: side detection, ECO/opening extraction, clock parsing.
- Opening-family aggregation idea.
- Chessground-style board interaction.

Rewritten from scratch:

- App architecture, API shape, job model, cache layout, frontend UI, CSS, and
  dashboard rendering.
- Owner-specific profile links, GitHub Pages refresh flow, `window.DATA` static
  injection, `plan.json` editing workflow, and annotations workflow.

Deferred:

- Accounts, payments, OAuth, email, plan editor, multi-user workspaces.
- Stockfish move-quality jobs.
- User-defined repertoire plans. The MVP operates in no-plan/observed mode.

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

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the FastAPI
server.

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
