// Debug X API authentication
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.development') });

import { TwitterApi } from 'twitter-api-v2';
import { TokenManager } from './src/services/token-manager';

async function main() {
  console.log('🔍 Debugging X API Authentication\n');

  const tokenManager = new TokenManager('ap-northeast-2');

  try {
    // 1. Get OAuth 2.0 token
    console.log('1️⃣ Fetching OAuth 2.0 token from Secrets Manager...');
    const oauth2Token = await tokenManager.getOAuth2Token();
    console.log(`   Token prefix: ${oauth2Token.substring(0, 20)}...`);

    // 2. Create client
    const client = new TwitterApi(oauth2Token);

    // 3. Test: Get authenticated user (requires users.read scope)
    console.log('\n2️⃣ Testing /me endpoint (users.read)...');
    try {
      const me = await client.v2.me({
        'user.fields': ['id', 'username', 'name', 'public_metrics'],
      });
      console.log(`   ✅ Authenticated as: @${me.data.username} (${me.data.id})`);
      console.log(`   Followers: ${me.data.public_metrics?.followers_count}`);
      console.log(`   Following: ${me.data.public_metrics?.following_count}`);
    } catch (e: any) {
      console.log(`   ❌ Failed: ${e.code} - ${e.message}`);
    }

    // 4. Test: Get my followers (requires follows.read scope)
    console.log('\n3️⃣ Testing /me/followers endpoint (follows.read)...');
    try {
      // Use the currentUser method
      const meAgain = await client.v2.me();
      const followers = await client.v2.followers(meAgain.data.id, { max_results: 10 });
      console.log(`   ✅ Found ${followers.data?.length || 0} followers (first page)`);
      if (followers.data) {
        followers.data.slice(0, 5).forEach((f) => {
          console.log(`      - @${f.username}`);
        });
      }
    } catch (e: any) {
      console.log(`   ❌ Failed: ${e.code} - ${e.message}`);

      if (e.code === 403) {
        console.log('\n   📋 Possible reasons for 403:');
        console.log('      1. App needs "Read and Write" permissions in Developer Portal');
        console.log('      2. User Access Levels need to be elevated');
        console.log('      3. API access level needs Basic tier ($100/month)');
        console.log('      4. OAuth app configuration issue');
      }
    }

    // 5. Test with OAuth 1.0a
    console.log('\n4️⃣ Testing with OAuth 1.0a (if available)...');
    try {
      const secrets = await import('fs').then((fs) =>
        JSON.parse(
          require('child_process')
            .execSync(
              'aws secretsmanager get-secret-value --secret-id nasun-twitter-tokens --query SecretString --output text'
            )
            .toString()
        )
      );

      if (secrets.accessToken && secrets.accessTokenSecret) {
        const oauth1Client = new TwitterApi({
          appKey: secrets.apiKey,
          appSecret: secrets.apiSecret,
          accessToken: secrets.accessToken,
          accessSecret: secrets.accessTokenSecret,
        });

        const me1 = await oauth1Client.v2.me();
        console.log(`   ✅ OAuth 1.0a: Authenticated as @${me1.data.username}`);

        const followers1 = await oauth1Client.v2.followers(me1.data.id, { max_results: 10 });
        console.log(`   ✅ Found ${followers1.data?.length || 0} followers with OAuth 1.0a`);
      }
    } catch (e: any) {
      console.log(`   ❌ OAuth 1.0a failed: ${e.message}`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

main();
