/**
 * poll-engagement Lambda Handler
 *
 * @description
 * EventBridge (5분 간격) 트리거로 X API tweet-centric 엔드포인트를 폴링하고
 * 결과를 DynamoDB 캐시에 저장합니다.
 *
 * Uses OAuth 1.0a User Context (required by X API Basic Plan).
 * Rate limit 사용량: 2 calls / 5 min = 6 calls / 15 min (한도 75의 8%)
 *
 * @author Claude Code
 * @created 2026-01-31
 */

import { ScheduledHandler } from 'aws-lambda';
import { EngagementPoller } from './services/engagementPoller';

// OAuth 1.0a credentials for User Context
const APP_KEY = process.env.TWITTER_API_KEY!;
const APP_SECRET = process.env.TWITTER_API_SECRET!;
const ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN!;
const ACCESS_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET!;

const TARGET_TWEET_ID = process.env.X_TARGET_TWEET_ID!;
const TASKS_TABLE_NAME = process.env.TASKS_TABLE_NAME!;

export const handler: ScheduledHandler = async (event) => {
  console.log('[poll-engagement] Triggered:', JSON.stringify(event));

  if (!APP_KEY || !APP_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET || !TARGET_TWEET_ID || !TASKS_TABLE_NAME) {
    console.error('[poll-engagement] Missing required environment variables');
    return;
  }

  const poller = new EngagementPoller({
    appKey: APP_KEY,
    appSecret: APP_SECRET,
    accessToken: ACCESS_TOKEN,
    accessSecret: ACCESS_SECRET,
    targetTweetId: TARGET_TWEET_ID,
    tasksTableName: TASKS_TABLE_NAME,
  });

  try {
    const result = await poller.poll();
    console.log('[poll-engagement] Poll complete:', result);
  } catch (error: any) {
    console.error('[poll-engagement] Poll failed:', error);
    // Do not throw — absorb transient errors
  }
};
