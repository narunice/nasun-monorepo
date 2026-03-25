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
        // DATABASE_URL must be set via: set -a && source .env && set +a
      },
      max_memory_restart: '512M',
      instances: 1,
      autorestart: true,
    },
  ],
};
