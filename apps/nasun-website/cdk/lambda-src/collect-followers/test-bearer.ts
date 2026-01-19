// Test with Bearer token (Basic tier)
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load production environment (Basic tier app)
dotenv.config({ path: path.resolve(__dirname, '../../.env.production') });

import { TwitterApi } from 'twitter-api-v2';

async function main() {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;

  if (!bearerToken) {
    console.error('TWITTER_BEARER_TOKEN is not set');
    process.exit(1);
  }

  console.log('🔍 Testing with Production Bearer Token (Basic tier)\n');
  console.log(`Token prefix: ${bearerToken.substring(0, 30)}...`);

  const client = new TwitterApi(bearerToken);
  const targetUserId = '1725466995565752320'; // GenSol_io

  // Test 1: User lookup
  console.log('\n1️⃣ User lookup...');
  try {
    const user = await client.v2.user(targetUserId, {
      'user.fields': ['public_metrics', 'verified'],
    });
    console.log(`   ✅ @${user.data.username}`);
    console.log(`   Followers: ${user.data.public_metrics?.followers_count}`);
    console.log(`   Following: ${user.data.public_metrics?.following_count}`);
  } catch (e: any) {
    console.log(`   ❌ Failed: ${e.code} - ${e.message}`);
  }

  // Test 2: Followers endpoint
  console.log('\n2️⃣ Followers endpoint...');
  try {
    const followers = await client.v2.followers(targetUserId, {
      max_results: 100,
      'user.fields': ['username', 'public_metrics', 'verified'],
    });

    console.log(`   ✅ Found ${followers.data?.length || 0} followers (first page)`);

    if (followers.data) {
      console.log('\n   Top 10 followers by follower count:');
      const sorted = [...followers.data].sort(
        (a, b) => (b.public_metrics?.followers_count || 0) - (a.public_metrics?.followers_count || 0)
      );
      sorted.slice(0, 10).forEach((f, i) => {
        console.log(`   ${i + 1}. @${f.username} (${f.public_metrics?.followers_count || 0} followers)`);
      });
    }

    if (followers.meta?.next_token) {
      console.log(`\n   Has more pages: Yes (next_token available)`);
    }
  } catch (e: any) {
    console.log(`   ❌ Failed: ${e.code} - ${e.message}`);

    if (e.data) {
      console.log(`   Error details:`, JSON.stringify(e.data, null, 2));
    }
  }
}

main();
