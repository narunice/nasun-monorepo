// pm2 deploy units for gostop-backend. Two processes, separate concerns:
//   - gostop-indexer:  chain event -> Postgres (gostop_writer role)
//   - gostop-backend:  REST + WS for frontend (gostop_reader role)
//
// Current runtime (verified 2026-05-18, node-3 /home/ubuntu/gostop-backend):
//   - api runs tsx-live from src/api/server.ts (port 3202)
//   - indexer runs compiled dist/indexer/index.js
//   - env is loaded by Node itself via `--env-file=.env` (Node >=20.6); the
//     deploy script also `set -a; source .env; set +a` before
//     pm2 startOrRestart so per-run env keys reach the daemon parse step
//     (feedback_pm2_daemon_env_resolution).
//
// Hot-fix pattern:
//   - api: in-place edit under src/api/** + `pm2 restart gostop-backend`
//     (tsx re-imports on restart, no rebuild needed)
//   - indexer: `pnpm build` then `pm2 restart gostop-indexer`

module.exports = {
  apps: [
    {
      name: 'gostop-backend',
      script: 'node',
      args: '--env-file=.env --import tsx src/api/server.ts',
      cwd: '/home/ubuntu/gostop-backend',
      max_memory_restart: '1024M',
      autorestart: true,
      max_restarts: 15,
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      kill_timeout: 5000,
      out_file: '/home/ubuntu/.pm2/logs/gostop-backend-out.log',
      error_file: '/home/ubuntu/.pm2/logs/gostop-backend-error.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'gostop-indexer',
      script: 'node',
      args: '--env-file=.env dist/indexer/index.js',
      cwd: '/home/ubuntu/gostop-backend',
      max_memory_restart: '512M',
      autorestart: true,
      max_restarts: 15,
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      kill_timeout: 5000,
      out_file: '/home/ubuntu/.pm2/logs/gostop-indexer-out.log',
      error_file: '/home/ubuntu/.pm2/logs/gostop-indexer-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
