# kaliDict

## Minimal server

1. Install dependencies: `npm --prefix server install`.
2. Create `server/.env` (see `server/.env.example`) to configure `PORT`.
3. Start the static server: `npm --prefix server start`.
4. Run with PM2 for process management: `npm --prefix server run pm2`.

The server reads assets directly from `src/`, so updates to the front-end are available without a build or symlink step.
