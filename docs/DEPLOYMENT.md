# Deployment

## Render

Use the container deployment for the generic Chess Coach product. The frontend
posts profile-analysis jobs to the FastAPI backend, so arbitrary Chess.com
profile entry requires a running backend.

Blueprint link after the repository is named `chess-coach`:

https://render.com/deploy?repo=https://github.com/madisonveldingvandam/chess-coach

Expected service settings:

- Name: `chess-coach`
- Runtime: Docker
- Plan: Free
- Branch: `main`
- Health check path: `/api/health`
- Runtime data directory: `/tmp/chess-coach-data`

The free Render plan uses an ephemeral filesystem, so cached Chess.com archives
and generated results can disappear when the instance restarts or redeploys.
That is acceptable for the first public URL because the app can refetch public
Chess.com data. For durable caching later, upgrade the service and mount a
persistent disk, then set `CHESS_COACH_DATA_DIR` to that disk path.

Render provides the runtime `PORT` environment variable for web services. The
Docker command binds Uvicorn to `0.0.0.0` and `${PORT:-10000}`.

## GitHub Pages

GitHub Pages can deploy the static frontend, but it cannot run live profile
analysis jobs. Use it for a static shell or an optional pre-generated sample
dashboard only.

Expected URL after the repository is named `chess-coach`:

https://madisonveldingvandam.github.io/chess-coach/

Workflow:

- `.github/workflows/pages.yml`
- Runs on push to `main`, every six hours, and manual dispatch.
- Runs backend tests.
- Optionally generates `frontend/public/data/default-dashboard.json` when the
  `CHESS_COACH_STATIC_USERNAME` repository variable is set.
- Builds Vite with `VITE_BASE_PATH` set from the repository name.
- Uploads `frontend/dist` to GitHub Pages.

Optional repository variables:

- `CHESS_COACH_STATIC_USERNAME`
- `CHESS_COACH_STATIC_TIME_CLASS`
- `CHESS_COACH_STATIC_ARCHIVE_MONTHS`
