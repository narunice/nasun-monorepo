const fs = require('fs');
const path = require('path');

// Auto-load .env file so PM2 restart/start always picks up all env vars.
// Previously required manual `set -a && source .env && set +a` before pm2 restart.
function loadDotenv() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};
  const vars = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    vars[key] = val;
  }
  return vars;
}

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
        ...loadDotenv(),
      },
      max_memory_restart: '512M',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
    },
  ],
};
