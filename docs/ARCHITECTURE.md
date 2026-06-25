# Architecture Checkpoint

## Product Boundary

Chess Coach is a new standalone repo and app. It should continue to run if the
old `chess-tracker` directory is deleted.

The MVP supports arbitrary public Chess.com usernames. It starts without
accounts, payments, email, OAuth, a polished repertoire editor, or multi-user
saved workspaces.

## Minimum Viable Stack

- `FastAPI` for the backend API and production static-file serving.
- `httpx` for Chess.com API calls.
- `python-chess` for PGN parsing and board/FEN generation.
- In-process job manager for the MVP, replaceable by a real queue later.
- Filesystem JSON cache under `data/`.
- `Vite` + TypeScript for the frontend.
- `chessground` from npm for board rendering.

## Core Flow

1. User enters a Chess.com handle and selects time class/month window.
2. Frontend calls `POST /api/analyses`.
3. Backend returns a job id immediately.
4. Frontend polls `GET /api/analyses/{job_id}`.
5. Worker fetches/caches public Chess.com archives, parses games, computes
   dashboard JSON, and stores the result.
6. Frontend renders from returned JSON.

## Hosting Recommendation

Start local-first. For the first public hosted version, use one containerized
FastAPI app on Render, Fly.io, or Railway with a persistent volume. That keeps
the worker, cache, and app together until usage justifies separating them.

Avoid GitHub Pages as the primary product host because it cannot run dynamic
analysis jobs. Avoid serverless-first deployment for Stockfish-heavy analysis
because request timeouts and ephemeral storage will become central constraints.

## Stockfish Decision

Stockfish should be optional and deferred. The MVP should produce useful
coaching signals from public game metadata and PGN alone. Engine analysis can be
added as a second job tier once cache format, job status, and UI expectations
are stable.

## Repertoire Decision

Start in no-plan mode. The app can infer observed openings and recurring loss
areas automatically. Intended repertoire requires user input, so it belongs in a
later plan-builder phase rather than being smuggled into static config.
