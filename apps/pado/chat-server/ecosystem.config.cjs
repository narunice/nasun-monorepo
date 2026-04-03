module.exports = {
  apps: [
    {
      name: 'pado-chat-server',
      script: 'dist/server.js',
      node_args: '--env-file=.env',
      max_memory_restart: '300M',
      kill_timeout: 10000,
      wait_ready: false,
      max_restarts: 15,
      min_uptime: '5s',
      restart_delay: 1000,
      autorestart: true,
    },
  ],
};
