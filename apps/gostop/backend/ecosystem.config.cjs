// pm2 deploy units for gostop-backend on prod EC2 (__PROD_EC2_HOST__, shared with
// nasun-website / pado / explorer-api). Two processes, separate concerns:
//   - gostop-indexer: chain event -> Postgres (gostop_writer role)
//   - gostop-api:     REST + WS for frontend (gostop_reader role)
//
// Operational notes:
//   - .env is sourced explicitly before pm2 startOrRestart so per-run env keys
//     reach the process. Do NOT enumerate env values here that you want to
//     override from .env (see chat-server ecosystem comments).
//   - max_memory_restart sized for 1500 DAU peak; revisit after Tier 0 launch.
//   - Restart cadence kept gentle (max_restarts 15, exp backoff) so RPC 503
//     storms don't flap-loop the process.

module.exports = {
  apps: [
    {
      name: 'gostop-indexer',
      script: 'dist/indexer/index.js',
      max_memory_restart: '512M',
      node_args: '--max-old-space-size=384',
      max_restarts: 15,
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      autorestart: true,
      env: {
        ROLE: 'indexer',
        NODE_ENV: 'production',
      },
    },
    {
      name: 'gostop-api',
      script: 'dist/api/server.js',
      max_memory_restart: '512M',
      node_args: '--max-old-space-size=384',
      max_restarts: 15,
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      autorestart: true,
      env: {
        ROLE: 'api',
        NODE_ENV: 'production',
        // PORT mirrors .env API_PORT; pm2 logs only.
      },
    },
  ],
};
