/**
 * OAuth 2.0 Setup Script (Self-contained)
 *
 * Starts a local HTTP callback server, opens the X/Twitter OAuth 2.0
 * authorization flow in the browser, exchanges the authorization code for
 * tokens, and stores them in AWS Secrets Manager.
 *
 * This script is self-contained — it does NOT depend on legacy V2 code.
 *
 * Prerequisites:
 *   - CDK node_modules installed (pnpm install in apps/nasun-website/cdk)
 *   - .env.development or .env.production with OAUTH2_CLIENT_ID, etc.
 *   - AWS credentials configured (default profile for dev, nasun-prod for prod)
 *
 * Usage:
 *   cd apps/nasun-website/cdk
 *
 *   # Dev environment (default AWS profile)
 *   npx tsx setup-oauth2-auto.ts                 # defaults to dev
 *   npx tsx setup-oauth2-auto.ts --env=dev
 *
 *   # Prod environment (requires nasun-prod profile)
 *   AWS_PROFILE=nasun-prod npx tsx setup-oauth2-auto.ts --env=prod
 */

import * as crypto from 'crypto';
import * as http from 'http';
import * as readline from 'readline';
import * as url from 'url';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs(): { environment: 'development' | 'production' } {
  const args = process.argv.slice(2);
  const envArg = args.find(a => a.startsWith('--env='));
  if (envArg) {
    const val = envArg.split('=')[1];
    if (val === 'prod' || val === 'production') {
      return { environment: 'production' };
    }
  }
  return { environment: 'development' };
}

// =============================================================================
// Environment Configuration
// =============================================================================

interface OAuthConfig {
  oauth2ClientId: string;
  oauth2ClientSecret: string;
  oauth2RedirectUri: string;
  secretName: string;
  targetUsername: string;
  targetUserId: string;
  awsRegion: string;
  environment: 'development' | 'production';
}

// Hardcoded per-environment config (same pattern as verify-oauth-token.ts)
const ENV_CONFIGS = {
  development: {
    envFile: '.env.development',
    targetUserId: '1725466995565752320',
    targetUsername: 'Nasun_io',
    awsRegion: 'ap-northeast-2',
  },
  production: {
    envFile: '.env.production',
    targetUserId: '1725466995565752320',
    targetUsername: 'Nasun_io',
    awsRegion: 'ap-northeast-2',
  },
};

function loadConfig(env: 'development' | 'production'): OAuthConfig {
  const envConfig = ENV_CONFIGS[env];

  // Load .env file
  dotenv.config({ path: path.resolve(__dirname, envConfig.envFile), override: true });

  const clientId = process.env.OAUTH2_CLIENT_ID;
  const clientSecret = process.env.OAUTH2_CLIENT_SECRET;
  const secretName = process.env.TWITTER_TOKENS_SECRET_NAME;

  if (!clientId) throw new Error(`OAUTH2_CLIENT_ID not set in ${envConfig.envFile}`);
  if (!clientSecret) throw new Error(`OAUTH2_CLIENT_SECRET not set in ${envConfig.envFile}`);
  if (!secretName) throw new Error(`TWITTER_TOKENS_SECRET_NAME not set in ${envConfig.envFile}`);

  return {
    oauth2ClientId: clientId,
    oauth2ClientSecret: clientSecret,
    oauth2RedirectUri: '', // Will be set to local callback URI
    secretName,
    targetUsername: process.env.X_TARGET_USERNAME || envConfig.targetUsername,
    targetUserId: envConfig.targetUserId,
    awsRegion: envConfig.awsRegion,
    environment: env,
  };
}

// =============================================================================
// CLI Helpers
// =============================================================================

function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// =============================================================================
// OAuth 2.0 PKCE Helpers (inlined — no V2 dependency)
// =============================================================================

const OAUTH2_SCOPES = 'tweet.read users.read follows.read offline.access like.read list.read';

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

function buildAuthorizationUrl(config: OAuthConfig, codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.oauth2ClientId,
    redirect_uri: config.oauth2RedirectUri,
    scope: OAUTH2_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://x.com/i/oauth2/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.oauth2ClientId,
    code,
    redirect_uri: config.oauth2RedirectUri,
    code_verifier: codeVerifier,
  });

  const credentials = Buffer.from(`${config.oauth2ClientId}:${config.oauth2ClientSecret}`).toString('base64');

  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<TokenResponse>;
}

// =============================================================================
// Main Flow
// =============================================================================

async function main() {
  const { environment } = parseArgs();
  const config = loadConfig(environment);

  const PORT = 5174;
  config.oauth2RedirectUri = `http://localhost:${PORT}/callback`;

  const envLabel = environment === 'development' ? 'Development' : 'Production';

  // Generate PKCE challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const authorizationUrl = buildAuthorizationUrl(config, codeChallenge, state);

  console.log('\nOAuth 2.0 Setup\n');
  console.log('='.repeat(60));
  console.log(`  Environment:    ${envLabel}`);
  console.log(`  Target Account: @${config.targetUsername} (${config.targetUserId})`);
  console.log(`  Secret Name:    ${config.secretName}`);
  console.log(`  Callback:       http://localhost:${PORT}/callback`);
  console.log('='.repeat(60));

  // Cross-environment invalidation warning
  const otherEnv = environment === 'development' ? 'Production' : 'Development';
  console.log('\n' + '!'.repeat(60));
  console.log('  WARNING: CROSS-ENVIRONMENT TOKEN INVALIDATION');
  console.log('!'.repeat(60));
  console.log(`  Dev and Prod share the same OAuth2 App (Client ID).`);
  console.log(`  Creating a new authorization here may invalidate`);
  console.log(`  the ${otherEnv} environment's refresh token.`);
  console.log('');
  console.log(`  If ${otherEnv} token refresh is active, it will start`);
  console.log(`  failing with "invalid_request" errors.`);
  console.log('!'.repeat(60));

  const confirmed = await promptConfirmation(`\n  Proceed with ${envLabel} OAuth2 setup? (y/N): `);
  if (!confirmed) {
    console.log('\n  Aborted.\n');
    process.exit(0);
  }

  console.log('\nOpen this URL in your browser:\n');
  console.log(authorizationUrl);

  console.log('\n' + '!'.repeat(60));
  console.log(`  IMPORTANT: Log in as @${config.targetUsername} in your browser!`);
  console.log('!'.repeat(60) + '\n');

  // Start local callback server
  const server = http.createServer();

  const setupPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out (5 minutes)'));
    }, 5 * 60 * 1000);

    server.on('request', async (req, res) => {
      const parsedUrl = url.parse(req.url!, true);

      if (parsedUrl.pathname !== '/callback') return;

      const returnedState = parsedUrl.query.state as string;
      const code = parsedUrl.query.code as string;

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>State mismatch — possible CSRF attack</h1>');
        clearTimeout(timeout);
        server.close();
        reject(new Error('State mismatch'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>No authorization code received</h1>');
        clearTimeout(timeout);
        server.close();
        reject(new Error('No authorization code'));
        return;
      }

      console.log('Authorization code received. Exchanging for tokens...\n');

      try {
        // Exchange code for tokens
        const tokens = await exchangeCodeForToken(config, code, codeVerifier);

        console.log('Token exchange successful:');
        console.log(`  Access Token:  ${tokens.access_token.substring(0, 10)}...[${tokens.access_token.length} chars]`);
        console.log(`  Refresh Token: ${tokens.refresh_token ? `${tokens.refresh_token.substring(0, 10)}...[${tokens.refresh_token.length} chars]` : 'NOT PROVIDED'}`);
        console.log(`  Expires In:    ${tokens.expires_in}s (${Math.floor(tokens.expires_in / 3600)}h)`);
        console.log(`  Scope:         ${tokens.scope}\n`);

        // Calculate expiry
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
        console.log(`  Expires At:    ${expiresAt.toISOString()}`);
        console.log(`                 ${expiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST\n`);

        // Verify authenticated user BEFORE saving to Secrets Manager
        console.log('Verifying authenticated user...');
        const meResponse = await fetch('https://api.x.com/2/users/me', {
          headers: { 'Authorization': `Bearer ${tokens.access_token}` },
        });

        let username = 'Unknown';
        let displayName = 'Unknown';

        if (meResponse.ok) {
          const meData = await meResponse.json() as { data: { username: string; name: string; id: string } };
          username = meData.data.username;
          displayName = meData.data.name;
          const userId = meData.data.id;

          console.log(`  Authenticated as: @${username} (${displayName})`);
          console.log(`  User ID:          ${userId}\n`);

          // Account mismatch check — abort before saving wrong tokens
          const isMatch = username.toLowerCase() === config.targetUsername.toLowerCase() ||
                          userId === config.targetUserId;

          if (!isMatch) {
            console.log('!'.repeat(60));
            console.log('  ERROR: ACCOUNT MISMATCH!');
            console.log('!'.repeat(60));
            console.log(`  Expected: @${config.targetUsername} (${config.targetUserId})`);
            console.log(`  Actual:   @${username} (${userId})`);
            console.log(`\n  Tokens NOT saved. Re-run and log in as @${config.targetUsername}.\n`);

            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html>
<html><head><title>Account Mismatch</title>
<style>body{font-family:system-ui;max-width:600px;margin:50px auto;padding:20px}
h1{color:#e74c3c}.err{background:#FFEBEE;padding:15px;border-radius:8px}</style>
</head><body>
<h1>Account Mismatch</h1>
<div class="err">
<p>Expected <strong>@${config.targetUsername}</strong>, got <strong>@${username}</strong>.</p>
<p>Tokens were NOT saved. Re-run the script and log in with the correct account.</p>
</div>
</body></html>`);

            clearTimeout(timeout);
            setTimeout(() => server.close(), 1000);
            reject(new Error(`Account mismatch: expected @${config.targetUsername}, got @${username}`));
            return;
          }

          console.log('  Account verified: token matches target.\n');
        } else {
          console.log(`  WARNING: Could not verify user (HTTP ${meResponse.status}). Proceeding anyway.\n`);
        }

        // Save to Secrets Manager (only after account verification passes)
        console.log('Updating Secrets Manager...');
        const secretsClient = new SecretsManagerClient({ region: config.awsRegion });

        const existing = await secretsClient.send(
          new GetSecretValueCommand({ SecretId: config.secretName })
        );
        const currentValue = JSON.parse(existing.SecretString || '{}');

        const updatedValue = {
          ...currentValue,
          oauth2: {
            clientId: config.oauth2ClientId,
            clientSecret: config.oauth2ClientSecret,
            userAccessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || '',
            redirectUri: config.oauth2RedirectUri,
            expiresAt: expiresAt.getTime(),
            lastRefreshed: new Date().toISOString(),
            scope: tokens.scope,
          },
        };

        await secretsClient.send(
          new UpdateSecretCommand({
            SecretId: config.secretName,
            SecretString: JSON.stringify(updatedValue, null, 2),
          })
        );
        console.log('Secrets Manager updated.\n');

        // Success page
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html><head><title>OAuth 2.0 Success</title>
<style>body{font-family:system-ui;max-width:600px;margin:50px auto;padding:20px}
h1{color:#1DA1F2}.ok{background:#E8F5E9;padding:15px;border-radius:8px}
.info{background:#E3F2FD;padding:15px;border-radius:8px;margin-top:15px}</style>
</head><body>
<h1>OAuth 2.0 Setup Complete</h1>
<div class="ok">
<p><strong>User:</strong> @${username} (${displayName})</p>
<p><strong>Expires:</strong> ${expiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
</div>
<div class="info"><p>Token saved to AWS Secrets Manager. You can close this tab.</p></div>
</body></html>`);

        clearTimeout(timeout);
        setTimeout(() => server.close(), 1000);

        console.log('='.repeat(60));
        console.log('  OAuth 2.0 setup complete.');
        console.log('='.repeat(60) + '\n');

        resolve();
      } catch (error: any) {
        console.error('\nToken exchange failed:', error.message);

        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Token Exchange Failed</h1><p>Check the terminal for details.</p>');

        clearTimeout(timeout);
        setTimeout(() => server.close(), 1000);
        reject(error);
      }
    });
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Waiting for authorization callback... (timeout: 5 min)\n`);
  });

  await setupPromise;
}

main().catch(error => {
  console.error('\nSetup failed:', error.message);
  process.exit(1);
});
