import { TwitterApi } from 'twitter-api-v2';
import { secureTokenManager } from '../src/services/secure-token-manager';

// Test with different tweets to see if the issue is tweet-specific
const TEST_TWEETS = [
  { id: "2009123468764467252", desc: "Target tweet (Nasun_io Quote Tweet)" },
  { id: "2009072293826453669", desc: "Quoted tweet (bcherny)" },
];

process.env.AWS_REGION = 'ap-northeast-2';

async function main() {
  console.log("Testing Liking Users API with different tweets...\n");

  const tokens = await secureTokenManager.getTokens();
  const oauth2Client = new TwitterApi(tokens.oauth2.userAccessToken!);

  // First, check current user (the authenticated user)
  console.log("═".repeat(50));
  console.log("Checking authenticated user...");
  console.log("═".repeat(50));
  try {
    const me = await oauth2Client.v2.me();
    console.log(`Authenticated as: @${me.data.username} (${me.data.id})`);
  } catch (error: any) {
    console.log(`Failed to get authenticated user: ${error.message}`);
  }

  for (const tweet of TEST_TWEETS) {
    console.log("\n" + "═".repeat(50));
    console.log(`Testing: ${tweet.desc}`);
    console.log(`Tweet ID: ${tweet.id}`);
    console.log("═".repeat(50));

    try {
      // First get tweet info
      const tweetInfo = await oauth2Client.v2.singleTweet(tweet.id, {
        'tweet.fields': ['public_metrics', 'author_id']
      });
      console.log(`\nTweet author: ${tweetInfo.data.author_id}`);
      console.log(`Like count (public_metrics): ${tweetInfo.data.public_metrics?.like_count || 0}`);

      // Now try to get liking users
      const likingUsers = await oauth2Client.v2.tweetLikedBy(tweet.id, {
        max_results: 100,
        'user.fields': ['username', 'name']
      });

      console.log(`\nLiking Users API result:`);
      console.log(`  result_count: ${likingUsers.meta?.result_count || 0}`);
      console.log(`  data length: ${likingUsers.data?.length || 0}`);

      if (likingUsers.data && likingUsers.data.length > 0) {
        console.log(`\n  Users who liked:`);
        for (const user of likingUsers.data.slice(0, 5)) {
          console.log(`    - @${user.username}`);
        }
      } else {
        console.log(`\n  ⚠️ No liking users returned`);
      }
    } catch (error: any) {
      console.log(`\n❌ Error: ${error.message}`);
      if (error.data) {
        console.log(`Error data: ${JSON.stringify(error.data, null, 2)}`);
      }
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log("Test complete!");
  console.log("═".repeat(50));
}

main().catch(console.error);
