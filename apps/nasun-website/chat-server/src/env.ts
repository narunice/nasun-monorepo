// Load .env file if present (for local dev without --env-file flag).
// This module must be imported FIRST in server.ts, before any module
// that reads process.env at the top level (e.g., auth.ts).
import { readFileSync } from 'node:fs';

try {
  const content = readFileSync('.env', 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // No .env file -- rely on existing environment variables (e.g., PM2 --env-file)
}
