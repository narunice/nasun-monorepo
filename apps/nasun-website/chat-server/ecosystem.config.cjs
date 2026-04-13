module.exports = {
  apps: [
    {
      name: 'nasun-chat-server',
      script: 'dist/server.js',
      node_args: '--env-file=.env',
      max_memory_restart: '400M',
      kill_timeout: 10000,
      wait_ready: false,
      max_restarts: 15,
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      autorestart: true,
    },
  ],
};
