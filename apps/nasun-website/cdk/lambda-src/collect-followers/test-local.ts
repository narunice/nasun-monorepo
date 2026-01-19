// Local test script for follower collection with OAuth 2.0
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (use development for valid OAuth 2.0 tokens)
dotenv.config({ path: path.resolve(__dirname, '../../.env.development') });

import { TwitterApiService } from './src/services/twitter-api';
import { TokenManager } from './src/services/token-manager';

async function main() {
  // Note: OAuth 2.0 User Context can only read followers of the authenticated user
  // Development token is authorized by @Naru010110
  const targetUserId = '1863020068785004544'; // Naru010110 (dev environment)
  const targetUsername = 'Naru010110';

  console.log(`\n🎯 Target: @${targetUsername} (${targetUserId})`);
  console.log('━'.repeat(50));

  // Try to get OAuth 2.0 token from Secrets Manager
  const tokenManager = new TokenManager('ap-northeast-2');
  let twitterApi: TwitterApiService;

  try {
    console.log('\n🔐 Attempting OAuth 2.0 authentication...');
    const oauth2Token = await tokenManager.getOAuth2Token();
    twitterApi = TwitterApiService.withOAuth2UserContext(oauth2Token);
    console.log('✅ Using OAuth 2.0 User Context authentication\n');
  } catch (error: any) {
    console.log(`⚠️ OAuth 2.0 not available: ${error.message}`);
    console.log('🔄 Falling back to Bearer token...\n');

    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
      console.error('❌ TWITTER_BEARER_TOKEN is not set');
      process.exit(1);
    }
    twitterApi = TwitterApiService.withBearerToken(bearerToken);
  }

  try {
    // Fetch followers
    console.log('📥 Fetching followers...\n');
    const followers = await twitterApi.fetchAllFollowers(targetUserId, 15000);

    console.log('\n' + '━'.repeat(50));
    console.log(`✅ Total followers fetched: ${followers.length}`);
    console.log('━'.repeat(50));

    // Show top 20 followers by follower count
    const sortedByFollowers = [...followers].sort(
      (a, b) => (b.followersCount || 0) - (a.followersCount || 0)
    );

    console.log('\n📊 Top 20 followers by follower count:\n');
    console.log('Rank | Username             | Followers  | Verified');
    console.log('-----|----------------------|------------|----------');

    sortedByFollowers.slice(0, 20).forEach((f, i) => {
      const rank = String(i + 1).padStart(4);
      const username = f.username.padEnd(20).slice(0, 20);
      const followers = String(f.followersCount || 0).padStart(10);
      const verified = f.verified ? '✓' : '';
      console.log(`${rank} | ${username} | ${followers} | ${verified}`);
    });

    // Summary stats
    const verifiedCount = followers.filter(f => f.verified).length;
    const totalFollowerCount = followers.reduce((sum, f) => sum + (f.followersCount || 0), 0);
    const avgFollowerCount = Math.round(totalFollowerCount / followers.length);

    console.log('\n📈 Summary:');
    console.log(`   Total followers: ${followers.length}`);
    console.log(`   Verified accounts: ${verifiedCount}`);
    console.log(`   Average follower count: ${avgFollowerCount.toLocaleString()}`);
    console.log(`   Total reach: ${totalFollowerCount.toLocaleString()}`);

    // Save to JSON file
    const outputPath = path.resolve(__dirname, 'followers-output.json');
    const fs = await import('fs');
    fs.writeFileSync(outputPath, JSON.stringify({
      targetUsername,
      targetUserId,
      fetchedAt: new Date().toISOString(),
      totalCount: followers.length,
      followers: followers,
    }, null, 2));
    console.log(`\n💾 Full data saved to: ${outputPath}`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 429) {
      console.error('Rate limit exceeded. Please wait 15 minutes and try again.');
    } else if (error.code === 403) {
      console.error('\nThe followers endpoint requires:');
      console.error('  - OAuth 2.0 User Context (follows.read scope) OR');
      console.error('  - Basic tier subscription ($100/month)');
    }
    process.exit(1);
  }
}

main();
