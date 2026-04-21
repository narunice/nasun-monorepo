module.exports = {
  apps: [
    {
      name: 'nasun-chat-server',
      script: 'dist/server.js',
      max_memory_restart: '700M',
      node_args: '--max-old-space-size=450',  // must be < max_memory_restart (RSS) so PM2 triggers before OOM crash
      kill_timeout: 20000,                    // backstop in shutdown() is 17000ms; SIGKILL at 20s
      wait_ready: false,
      max_restarts: 15,
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      autorestart: true,
    },
  ],
};
