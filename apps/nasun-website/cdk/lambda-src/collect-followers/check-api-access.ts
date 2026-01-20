// Check X API access level
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.production') });

import { TwitterApi } from 'twitter-api-v2';

async function main() {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;

  if (!bearerToken) {
    console.error('TWITTER_BEARER_TOKEN is not set');
    process.exit(1);
  }

  console.log('🔍 Checking X API access levels...\n');

  const client = new TwitterApi(bearerToken);

  // Test 1: User lookup (free tier)
  console.log('1️⃣ User lookup (Free tier)...');
  try {
    const user = await client.v2.userByUsername('Nasun_io');
    console.log(`   ✅ Success: @${user.data?.username} (ID: ${user.data?.id})`);
  } catch (e: any) {
    console.log(`   ❌ Failed: ${e.message}`);
  }

  // Test 2: Tweet lookup (free tier)
  console.log('\n2️⃣ Recent search (Free tier)...');
  try {
    const tweets = await client.v2.search('from:Nasun_io', { max_results: 10 });
    console.log(`   ✅ Success: Found ${tweets.data?.data?.length || 0} tweets`);
  } catch (e: any) {
    console.log(`   ❌ Failed: ${e.message}`);
  }

  // Test 3: Followers (Basic tier - $100/month)
  console.log('\n3️⃣ Followers endpoint (Basic tier - $100/month)...');
  try {
    const followers = await client.v2.followers('1725466995565752320', { max_results: 10 });
    console.log(`   ✅ Success: Found ${followers.data?.length || 0} followers`);
  } catch (e: any) {
    console.log(`   ❌ Failed: ${e.code} - ${e.message}`);
  }

  // Test 4: With OAuth 2.0 User Context token
  console.log('\n4️⃣ Checking OAuth 2.0 User Context tokens...');
  const oauth2AccessToken = process.env.OAUTH2_USER_ACCESS_TOKEN;
  if (oauth2AccessToken && !oauth2AccessToken.startsWith('TBD')) {
    try {
      const userClient = new TwitterApi(oauth2AccessToken);
      const followers = await userClient.v2.followers('1725466995565752320', { max_results: 10 });
      console.log(`   ✅ Success with OAuth 2.0: Found ${followers.data?.length || 0} followers`);
    } catch (e: any) {
      console.log(`   ❌ OAuth 2.0 Failed: ${e.code} - ${e.message}`);
    }
  } else {
    console.log('   ⚠️  OAUTH2_USER_ACCESS_TOKEN not configured');
  }

  console.log('\n📋 Summary:');
  console.log('   - Free tier endpoints work with Bearer Token');
  console.log('   - Followers endpoint requires Basic tier ($100/month) OR OAuth 2.0 User Context');
  console.log('   - Consider using OAuth 2.0 User Context if available');
}

main();
