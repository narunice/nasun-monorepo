import { secureTokenManager } from '../src/services/secure-token-manager';

process.env.AWS_REGION = 'ap-northeast-2';

async function main() {
  console.log('Checking OAuth2 token scope...\n');

  const tokens = await secureTokenManager.getTokens();

  console.log('OAuth2 Token Info:');
  console.log('  scope:', tokens.oauth2.scope || 'NOT SET');
  console.log('  expiresAt:', tokens.oauth2.expiresAt ? new Date(tokens.oauth2.expiresAt).toISOString() : 'NOT SET');
  console.log('  hasUserAccessToken:', tokens.oauth2.userAccessToken ? 'YES' : 'NO');
  console.log('  hasRefreshToken:', tokens.oauth2.refreshToken ? 'YES' : 'NO');

  // Check if like.read scope is present
  const scope = tokens.oauth2.scope || '';
  const requiredScopes = ['like.read', 'tweet.read', 'users.read', 'offline.access'];

  console.log('\nScope Analysis:');
  for (const required of requiredScopes) {
    const hasScope = scope.includes(required);
    console.log(`  ${required}: ${hasScope ? 'OK' : 'MISSING'}`);
  }

  if (!scope.includes('like.read')) {
    console.log('\n⚠️ CRITICAL: like.read scope is MISSING!');
    console.log('   This is why Liking Users API returns empty results.');
    console.log('   You need to re-authorize with the correct scopes.');
  }
}

main().catch(console.error);
