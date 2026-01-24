
import { TwitterApi } from 'twitter-api-v2';
import { secureTokenManager } from '../src/services/secure-token-manager';

const MISSING_TWEET_ID = "2009123468764467252";
const TARGET_USER_ID = "1725466995565752320"; // Dev env: Nasun_io

async function main() {
  console.log("🚀 Debugging Quote Tweet retrieval...\n");
  console.log("📋 Config:");
  console.log(`   MISSING_TWEET_ID: ${MISSING_TWEET_ID}`);
  console.log(`   TARGET_USER_ID (from env): ${TARGET_USER_ID}\n`);

  try {
    // 1. Get Tokens
    process.env.AWS_REGION = "ap-northeast-2";
    console.log("🔐 Fetching tokens from Secrets Manager...");
    const tokens = await secureTokenManager.getTokens();
    console.log("✅ Tokens fetched.\n");

    // Create clients
    const oauth2Client = new TwitterApi(tokens.oauth2.userAccessToken!);
    const bearerClient = new TwitterApi(tokens.bearerToken!);

    // ============================================
    // TEST 0: Verify Nasun_io's actual user_id
    // ============================================
    console.log("═".repeat(50));
    console.log("TEST 0: Verify Nasun_io's actual user_id");
    console.log("═".repeat(50));

    try {
      const user = await bearerClient.v2.userByUsername('Nasun_io');
      console.log("\n✅ Nasun_io user info:");
      console.log(JSON.stringify(user.data, null, 2));

      if (user.data.id !== TARGET_USER_ID) {
        console.log(`\n⚠️ WARNING: user_id mismatch!`);
        console.log(`   Expected (from env): ${TARGET_USER_ID}`);
        console.log(`   Actual (from API):   ${user.data.id}`);
      } else {
        console.log(`\n✅ user_id matches: ${user.data.id}`);
      }
    } catch (error: any) {
      console.log(`\n❌ User lookup failed: ${error.message}`);
    }

    // ============================================
    // TEST 1: Direct Tweet Lookup (Bearer Token)
    // ============================================
    console.log("═".repeat(50));
    console.log("TEST 1: Direct Tweet Lookup (Bearer Token)");
    console.log("═".repeat(50));

    try {
      const singleTweet = await bearerClient.v2.singleTweet(MISSING_TWEET_ID, {
        'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'referenced_tweets', 'conversation_id', 'text'],
        expansions: ['referenced_tweets.id']
      });

      console.log("\n✅ Tweet found via singleTweet (Bearer):");
      console.log(JSON.stringify(singleTweet.data, null, 2));

      if (singleTweet.data.referenced_tweets) {
        console.log("\n📎 Referenced Tweets:");
        console.log(JSON.stringify(singleTweet.data.referenced_tweets, null, 2));
      }
    } catch (error: any) {
      console.log(`\n❌ singleTweet (Bearer) failed: ${error.message}`);
      if (error.data) {
        console.log("Error data:", JSON.stringify(error.data, null, 2));
      }
    }

    // ============================================
    // TEST 2: User Timeline (OAuth 2.0) - No exclude
    // ============================================
    console.log("\n" + "═".repeat(50));
    console.log("TEST 2: User Timeline (OAuth 2.0) - No exclude option");
    console.log("═".repeat(50));

    const startTime = "2026-01-08T00:00:00.000Z";
    const endTime = "2026-01-08T23:59:59.999Z";
    console.log(`📅 Date range: ${startTime} ~ ${endTime}`);

    try {
      const timeline = await oauth2Client.v2.userTimeline(TARGET_USER_ID, {
        max_results: 100,
        start_time: startTime,
        end_time: endTime,
        // NO exclude option
        'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'referenced_tweets', 'conversation_id'],
        expansions: ['referenced_tweets.id']
      });

      console.log(`\n📊 Result count: ${timeline.data.meta?.result_count || 0}`);

      if (timeline.data.data && timeline.data.data.length > 0) {
        console.log("\n📝 Tweets found:");
        for (const tweet of timeline.data.data) {
          const refType = tweet.referenced_tweets?.map(r => r.type).join(', ') || 'original';
          console.log(`  - ${tweet.id} [${refType}]: ${tweet.text?.substring(0, 50)}...`);
        }

        const found = timeline.data.data.find(t => t.id === MISSING_TWEET_ID);
        if (found) {
          console.log(`\n✅ Missing tweet ${MISSING_TWEET_ID} FOUND in timeline!`);
        } else {
          console.log(`\n❌ Missing tweet ${MISSING_TWEET_ID} NOT in timeline`);
        }
      } else {
        console.log("\n⚠️ No tweets returned from timeline");
      }
    } catch (error: any) {
      console.log(`\n❌ Timeline failed: ${error.message}`);
    }

    // ============================================
    // TEST 3: User Timeline (Bearer Token)
    // ============================================
    console.log("\n" + "═".repeat(50));
    console.log("TEST 3: User Timeline (Bearer Token) - No exclude option");
    console.log("═".repeat(50));

    try {
      const timeline = await bearerClient.v2.userTimeline(TARGET_USER_ID, {
        max_results: 100,
        start_time: startTime,
        end_time: endTime,
        // NO exclude option
        'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'referenced_tweets', 'conversation_id'],
        expansions: ['referenced_tweets.id']
      });

      console.log(`\n📊 Result count: ${timeline.data.meta?.result_count || 0}`);

      if (timeline.data.data && timeline.data.data.length > 0) {
        console.log("\n📝 Tweets found:");
        for (const tweet of timeline.data.data) {
          const refType = tweet.referenced_tweets?.map(r => r.type).join(', ') || 'original';
          console.log(`  - ${tweet.id} [${refType}]: ${tweet.text?.substring(0, 50)}...`);
        }
      } else {
        console.log("\n⚠️ No tweets returned from Bearer Token timeline");
      }
    } catch (error: any) {
      console.log(`\n❌ Bearer Token Timeline failed: ${error.message}`);
    }

    // ============================================
    // TEST 4: Liking Users API (OAuth 2.0)
    // ============================================
    console.log("\n" + "═".repeat(50));
    console.log("TEST 4: Liking Users API (OAuth 2.0)");
    console.log("═".repeat(50));

    try {
      console.log(`\n🔍 Fetching liking users for tweet ${MISSING_TWEET_ID}...`);
      const likingUsers = await oauth2Client.v2.tweetLikedBy(MISSING_TWEET_ID, {
        max_results: 100,
        'user.fields': ['username', 'name', 'profile_image_url', 'public_metrics']
      });

      console.log("\n📊 Full API Response:");
      console.log(JSON.stringify({
        data_length: likingUsers.data?.length || 0,
        meta: likingUsers.meta,
        errors: likingUsers.errors
      }, null, 2));

      if (likingUsers.data && likingUsers.data.length > 0) {
        console.log(`\n✅ Found ${likingUsers.data.length} liking users:`);
        for (const user of likingUsers.data.slice(0, 5)) {
          console.log(`  - @${user.username} (${user.name})`);
        }
        if (likingUsers.data.length > 5) {
          console.log(`  ... and ${likingUsers.data.length - 5} more`);
        }
      } else {
        console.log("\n⚠️ No liking users returned!");
        console.log("   Possible causes:");
        console.log("   1. X API access level does not support Liking Users endpoint");
        console.log("   2. OAuth 2.0 token missing 'like.read' scope");
        console.log("   3. API rate limit or temporary issue");
      }
    } catch (error: any) {
      console.log(`\n❌ Liking Users API failed: ${error.message}`);
      if (error.data) {
        console.log("Error data:", JSON.stringify(error.data, null, 2));
      }
      if (error.code === 403) {
        console.log("\n⚠️ HTTP 403: Access forbidden - likely API tier restriction");
      }
    }

    // ============================================
    // TEST 5: Liking Users API (OAuth 1.0a)
    // ============================================
    console.log("\n" + "═".repeat(50));
    console.log("TEST 5: Liking Users API (OAuth 1.0a)");
    console.log("═".repeat(50));

    try {
      const oauth1Client = new TwitterApi({
        appKey: tokens.apiKey,
        appSecret: tokens.apiSecret,
        accessToken: tokens.accessToken,
        accessSecret: tokens.accessTokenSecret
      });

      console.log(`\n🔍 Fetching liking users for tweet ${MISSING_TWEET_ID}...`);
      const likingUsers = await oauth1Client.v2.tweetLikedBy(MISSING_TWEET_ID, {
        max_results: 100,
        'user.fields': ['username', 'name', 'profile_image_url', 'public_metrics']
      });

      console.log("\n📊 Full API Response (OAuth 1.0a):");
      console.log(JSON.stringify({
        data_length: likingUsers.data?.length || 0,
        meta: likingUsers.meta,
        errors: likingUsers.errors
      }, null, 2));

      if (likingUsers.data && likingUsers.data.length > 0) {
        console.log(`\n✅ Found ${likingUsers.data.length} liking users via OAuth 1.0a`);
      } else {
        console.log("\n⚠️ No liking users returned via OAuth 1.0a either");
      }
    } catch (error: any) {
      console.log(`\n❌ OAuth 1.0a Liking Users API failed: ${error.message}`);
    }

    console.log("\n" + "═".repeat(50));
    console.log("Debug complete!");
    console.log("═".repeat(50));

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
