#!/usr/bin/env node
import 'source-map-support/register';
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
const EXPECTED_ACCOUNTS: Record<string, string> = {
  development: '135808943968', // nasun-dev
  production: '466841130170',  // nasun-prod
};
const env = { account: EXPECTED_ACCOUNTS[nodeEnv], region: 'us-east-1' };

const isProd = nodeEnv === 'production';

const app = new cdk.App();

// Basic auth tokens: base64("user:password") — keep plaintext mapping out of git.
const BASIC_AUTH_TOKENS = [
  'YWRtaW46bmFzdW4yMDI2',
  'R2VuU29sOkdlblNvbDIwMjU=',
];

new GostopSiteStack(app, isProd ? 'GostopSiteStack' : 'GostopSiteStagingStack', {
  env,
  domainName: isProd ? 'gostop.app' : 'staging.gostop.app',
  // Prod also serves www.gostop.app. Staging is apex-only (no www.staging).
  subdomains: isProd ? ['www'] : [],
  basicAuthTokens: isProd ? undefined : BASIC_AUTH_TOKENS,
  // Direct A record for gostop-backend on node-3. Only the prod zone owns the
  // api subdomain; staging frontend will point at https://api.gostop.app.
  apiBackendIp: isProd ? '54.180.61.196' : undefined,
  description: isProd
    ? 'gostop.app static SPA hosting (S3 + CloudFront + Route53)'
    : 'staging.gostop.app static SPA hosting (S3 + CloudFront + Route53)',
  tags: {
    Project: 'gostop',
    ManagedBy: 'cdk',
    Environment: isProd ? 'production' : 'staging',
  },
});
