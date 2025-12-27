

/**
 * NASUN Leaderboard OAuth 2.0 Token Initializer (v2 - Simplified)
 * 
 * Description:
 * This script automates the OAuth 2.0 PKCE flow to generate a user-context
 * access token for the target Twitter account and stores it in AWS Secrets Manager.
 * It is designed to be run from within the /cdk directory.
 * 
 * Usage:
 * cd <MONOREPO>/nasun-website/cdk
 * npx tsx ./init-oauth-token.ts
 */

import * as http from 'http';
import * as url from 'url';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

// Use static, relative paths, assuming execution from /cdk directory
import { createAuthorizationRequest, exchangeCodeForToken, calculateTokenExpiry } from './lambda-src/x-leaderboard/src/utils/oauth2-helper';
import { getEnvConfigV2, EnvConfigV2 } from './lambda-src/x-leaderboard/src/utils/env';
import { SecretsManagerClient, UpdateSecretCommand, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Load environment variables from .env file in the current directory (cdk)
dotenv.config();

// --- Main Application Logic ---

async function main() {
  const config = getEnvConfigV2();
  const redirectUri = new url.URL(config.oauth2RedirectUri);
  const PORT = parseInt(redirectUri.port, 10);

  if (!PORT) {
    throw new Error(`Invalid redirect URI port: ${config.oauth2RedirectUri}`);
  }

  const authRequest = createAuthorizationRequest(config);
  
  console.log('\n');
  console.log('************************************************************************************************');
  console.log('🔗 Step 1: Authorize the Application');
  console.log('************************************************************************************************');
  console.log('Please open the following URL in your browser. Log in as @Naru010110 when prompted.\n');
  console.log(authRequest.authorizationUrl);
  console.log(`\nWaiting for authorization callback on http://localhost:${PORT}${redirectUri.pathname} ...`);
  console.log('************************************************************************************************');

  const server = http.createServer();
  
  const serverTimeout = setTimeout(() => {
    console.error('\n❌ Error: Authorization timed out after 2 minutes. Please try again.');
    server.close();
    process.exit(1);
  }, 120000);

  server.on('request', async (req, res) => {
    try {
      const parsedUrl = url.parse(req.url!, true);
      if (parsedUrl.pathname === redirectUri.pathname) {
        const { code, state } = parsedUrl.query;

        console.log('\n✅ Callback received!');

        if (state !== authRequest.state) {
          throw new Error('Invalid state parameter. Possible CSRF attack.');
        }
        if (!code || typeof code !== 'string') {
          throw new Error('Authorization code not found in callback URL.');
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>✅ 인증 성공!</h1><p>This window can be closed. Please return to your terminal.</p>');
        server.close();
        clearTimeout(serverTimeout);

        await processToken(config, code, authRequest.codeVerifier);
      }
    } catch (error: any) {
      console.error('\n❌ An error occurred during callback processing:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>❌ Authentication Failed</h1><p>An error occurred. Please check the terminal.</p>');
      server.close();
      clearTimeout(serverTimeout);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    const openCommand = process.platform === 'win32' ? 'start' : 'open';
    try {
      execSync(`${openCommand} "${authRequest.authorizationUrl}"`);
    } catch (e) {
      console.warn('Could not automatically open browser. Please copy the URL manually.');
    }
  });
}

async function processToken(config: EnvConfigV2, code: string, codeVerifier: string) {
  try {
    console.log('\n************************************************************************************************');
    console.log('🔐 Step 2: Exchanging Authorization Code for Access Token');
    console.log('************************************************************************************************');
    
    const tokenResponse = await exchangeCodeForToken(config, code, codeVerifier);
    console.log('✅ Token exchange successful!');
    
    const expiresAt = calculateTokenExpiry(tokenResponse.expires_in);

    console.log('\n************************************************************************************************');
    console.log('💾 Step 3: Storing Tokens in AWS Secrets Manager');
    console.log('************************************************************************************************');

    const secretsClient = new SecretsManagerClient({ region: config.awsRegion });
    const currentSecret = await secretsClient.send(new GetSecretValueCommand({ SecretId: 'nasun-twitter-tokens' }));
    const currentValue = JSON.parse(currentSecret.SecretString || '{}');

    const updatedValue = {
      ...currentValue,
      oauth2: {
        ...currentValue.oauth2,
        userAccessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: expiresAt.getTime(),
      },
      lastUpdated: new Date().toISOString(),
      version: '2.4-automated',
    };

    await secretsClient.send(new UpdateSecretCommand({
      SecretId: 'nasun-twitter-tokens',
      SecretString: JSON.stringify(updatedValue, null, 2),
    }));
    console.log("✅ Secret 'nasun-twitter-tokens' updated successfully.");

    console.log('\n************************************************************************************************');
    console.log('🔍 Step 4: Verifying Token Owner');
    console.log('************************************************************************************************');

    const meResponse = await fetch('https://api.x.com/2/users/me', {
      headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` },
    });

    if (!meResponse.ok) {
      throw new Error(`Failed to verify token owner: ${meResponse.statusText}`);
    }
    
    const meData = await meResponse.json();
    const username = meData.data.username;
    console.log(`✅ Token belongs to: @${username} (ID: ${meData.data.id})`);

    if (username.toLowerCase() !== 'naru010110' && username.toLowerCase() !== 'nasun_io') {
      console.warn('\n⚠️ WARNING: The authenticated user is not a target account (@Naru010110 or @Nasun_io).');
    } else {
      console.log('✅ Token successfully issued for the target account!');
    }

    console.log('\n************************************************************************************************');
    console.log('🎉 OAuth 2.0 Token Setup Complete! You can now proceed with testing.');
    console.log('************************************************************************************************');
    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ An error occurred during token processing:', error.message);
    if (error.response) {
      console.error('   Response:', await error.response.text());
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('An unexpected error occurred:', error);
  process.exit(1);
});
