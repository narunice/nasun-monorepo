/**
 * Secret loading for the box-hosted AI host.
 *
 * Replaces the Lambda's two AWS calls, which died with the prod account in the
 * 2026-07 exit: AI provider keys came from SSM SecureStrings, and the executor
 * signing key from Secrets Manager (`baram/executor`).
 *
 * Provider keys now come straight from the environment, which is how every
 * other box service takes its credentials (systemd EnvironmentFile). The
 * executor key is read from a file instead, because it is a signing key for a
 * registered on-chain executor and a file can carry permissions that an env
 * var cannot: a key readable by anyone but this service is refused outright
 * rather than quietly used.
 */

import { readFile, stat } from 'node:fs/promises';

// Provider name -> env var holding its API key. A missing or empty value
// skips that provider, exactly as a missing SSM parameter did; ai.ts narrows
// its fallback chain to whatever has keys and throws if that set is empty.
// Values may be a comma-separated list -- ai.ts splits them and rotates.
export const AI_PROVIDER_ENV: Record<string, string> = {
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  sambanova: 'SAMBANOVA_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export function loadProviderApiKeys(): Record<string, string | null> {
  const keys: Record<string, string | null> = {};
  for (const [provider, envVar] of Object.entries(AI_PROVIDER_ENV)) {
    const raw = process.env[envVar];
    if (raw && raw.trim()) {
      keys[provider] = raw.trim();
      console.log(`[Secrets] ${provider} API key loaded from ${envVar}`);
    } else {
      keys[provider] = null;
    }
  }
  const configured = Object.values(keys).filter(Boolean).length;
  if (configured === 0) {
    // Loud, because the Lambda's equivalent failure mode was a cold start
    // that silently routed every inference to a provider the deploy never
    // intended. Here there is no provider at all, so say so plainly: the
    // caller (initProviders) throws right after.
    console.error(
      '[Secrets] No AI provider API key found. Set at least one of: '
      + Object.values(AI_PROVIDER_ENV).join(', '),
    );
  }
  return keys;
}

/**
 * Read the executor signing key. `EXECUTOR_KEY_PATH` is the intended source;
 * `EXECUTOR_PRIVATE_KEY` stays available for local development, where there is
 * no key file to protect.
 */
export async function loadExecutorPrivateKey(): Promise<string> {
  const inline = process.env.EXECUTOR_PRIVATE_KEY;
  const keyPath = process.env.EXECUTOR_KEY_PATH;

  if (keyPath) {
    const info = await stat(keyPath).catch((err: { code?: string }) => {
      throw new Error(
        `executor key unreadable at EXECUTOR_KEY_PATH=${keyPath} (${err.code ?? 'unknown error'})`,
      );
    });
    // 0o077 is the group+other bits. A signing key those can read is a
    // misconfiguration, not a warning: refusing to boot is what keeps a
    // loosened file from being noticed only after it has been used.
    if (info.mode & 0o077) {
      throw new Error(
        `executor key at ${keyPath} is mode ${(info.mode & 0o777).toString(8)}; `
        + 'must not be readable by group or other (chmod 600)',
      );
    }
    const value = (await readFile(keyPath, 'utf8')).trim();
    if (!value) throw new Error(`executor key file is empty: ${keyPath}`);
    console.log(`[Secrets] Executor key loaded from ${keyPath}`);
    return value;
  }

  if (inline && inline.trim()) {
    console.warn('[Secrets] Executor key taken from EXECUTOR_PRIVATE_KEY; prefer EXECUTOR_KEY_PATH');
    return inline.trim();
  }

  throw new Error('executor key missing: set EXECUTOR_KEY_PATH (preferred) or EXECUTOR_PRIVATE_KEY');
}
