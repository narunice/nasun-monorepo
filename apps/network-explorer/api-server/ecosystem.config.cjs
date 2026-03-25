module.exports = {
  apps: [
    {
      name: 'explorer-api',
      script: './node_modules/.bin/tsx',
      args: 'src/index.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 3200,
        CHAIN_ID: '272218f1',
        // DATABASE_URL and POINTS_DATABASE_URL must be set via: set -a && source .env && set +a
        // POINTS_DATABASE_URL: postgres://user:pass@localhost:5432/nasun_points
        // WALLET_MAPPINGS_URL: https://api.nasun.io/internal/wallet-mappings
        // WALLET_MAPPINGS_API_KEY: (set in .env)
      },
      max_memory_restart: '512M',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
    },
  ],
};
