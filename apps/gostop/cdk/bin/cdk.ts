#!/usr/bin/env node
import 'source-map-support/register';
import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { GostopSiteStack } from '../lib/gostop-site-stack';

// Require explicit NODE_ENV to prevent accidental cross-account contamination.
// Without this guard, omitting NODE_ENV would silently pick a default and
// could deploy to the wrong AWS account.
const nodeEnv = process.env.NODE_ENV;
if (!nodeEnv || !['development', 'production'].includes(nodeEnv)) {
  console.error('[CDK] ERROR: NODE_ENV must be explicitly set to "development" or "production".');
  console.error('[CDK] Usage: NODE_ENV=development npx cdk deploy <stack>');
  console.error('[CDK]        NODE_ENV=production  npx cdk deploy <stack>');
  process.exit(1);
}

// Account-env mapping: CDK refuses to deploy if current AWS creds don't match.
// Region is HARD-CODED to us-east-1 because CloudFront ACM certs MUST live
// in us-east-1 regardless of where the rest of the infra is.
//
// Account IDs are redacted from the committed source as part of the public-repo
// hygiene policy. The real IDs live in apps/gostop/cdk/.env.<env> (gitignored)
// or in shell env vars AWS_DEV_ACCOUNT_ID / AWS_PROD_ACCOUNT_ID.
function readEnvValue(envFile: string, key: string): string | undefined {
  if (!fs.existsSync(envFile)) return undefined;
  const line = fs.readFileSync(envFile, 'utf-8')
    .split('\n').map((l) => l.trim())
    .find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : undefined;
}
const envFilePath = path.resolve(__dirname, '..', `.env.${nodeEnv === 'production' ? 'production' : 'staging'}`);
const accountId =
  process.env[nodeEnv === 'production' ? 'AWS_PROD_ACCOUNT_ID' : 'AWS_DEV_ACCOUNT_ID']
  ?? readEnvValue(envFilePath, 'AWS_ACCOUNT_ID');
if (!accountId || !/^\d{12}$/.test(accountId)) {
  console.error(`[CDK] ERROR: AWS account ID not configured for ${nodeEnv}.`);
  console.error(`[CDK]   Either export AWS_${nodeEnv === 'production' ? 'PROD' : 'DEV'}_ACCOUNT_ID=<12-digit-id>`);
  console.error(`[CDK]   or add AWS_ACCOUNT_ID=<12-digit-id> to ${envFilePath}.`);
  process.exit(1);
}
const env = { account: accountId, region: 'us-east-1' };

const isProd = nodeEnv === 'production';

const app = new cdk.App();

// Basic auth tokens for staging: base64("user:password"), loaded from
// apps/gostop/cdk/.env.staging (gitignored). Never commit plaintext or base64
// tokens — base64 is a 1-step decode away from credentials. Prior commits leaked
// these into cdk.out and git history; rotated 2026-05-29.
function loadStagingBasicAuthTokens(): string[] {
  // 1) Env var takes precedence (CI / explicit shell export)
  const envValue = process.env.STAGING_BASIC_AUTH_TOKENS;
  if (envValue) {
    return envValue.split(',').map((t) => t.trim()).filter(Boolean);
  }
  // 2) Fall back to .env.staging file (local developer machines)
  const envFile = path.resolve(__dirname, '..', '.env.staging');
  if (fs.existsSync(envFile)) {
    const line = fs.readFileSync(envFile, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('STAGING_BASIC_AUTH_TOKENS='));
    if (line) {
      return line.slice('STAGING_BASIC_AUTH_TOKENS='.length)
        .split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  return [];
}

const BASIC_AUTH_TOKENS = isProd ? [] : loadStagingBasicAuthTokens();
if (!isProd && BASIC_AUTH_TOKENS.length === 0) {
  console.error('[CDK] ERROR: STAGING_BASIC_AUTH_TOKENS is required for staging deploy.');
  console.error('[CDK]   Either export STAGING_BASIC_AUTH_TOKENS=token1,token2');
  console.error('[CDK]   or create apps/gostop/cdk/.env.staging with that line.');
  process.exit(1);
}

new GostopSiteStack(app, isProd ? 'GostopSiteStack' : 'GostopSiteStagingStack', {
  env,
  domainName: isProd ? 'gostop.app' : 'staging.gostop.app',
  // Prod also serves www.gostop.app. Staging is apex-only (no www.staging).
  subdomains: isProd ? ['www'] : [],
  basicAuthTokens: isProd ? undefined : BASIC_AUTH_TOKENS,
  // (BASIC_AUTH_TOKENS comes from .env.staging / env var — never inline plaintext.)
  // Direct A record for gostop-backend on node-3. Only the prod zone owns the
  // api subdomain; staging frontend will point at https://api.gostop.app.
  apiBackendIp: isProd ? '__INDEXER_NODE_HOST__' : undefined,
  description: isProd
    ? 'gostop.app static SPA hosting (S3 + CloudFront + Route53)'
    : 'staging.gostop.app static SPA hosting (S3 + CloudFront + Route53)',
  tags: {
    Project: 'gostop',
    ManagedBy: 'cdk',
    Environment: isProd ? 'production' : 'staging',
  },
});
