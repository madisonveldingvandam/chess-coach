# Deployment

## Render

This repo is configured for a Docker-based Render web service.

Use this Blueprint link:

https://render.com/deploy?repo=https://github.com/madisonveldingvandam/chess-coach-bodega-ben

Expected service settings:

- Name: `chess-coach-bodega-ben`
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
