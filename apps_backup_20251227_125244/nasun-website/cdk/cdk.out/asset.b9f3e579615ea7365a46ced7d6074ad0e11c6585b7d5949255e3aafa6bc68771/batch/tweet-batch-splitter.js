"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/handlers/batch/tweet-batch-splitter.ts
var tweet_batch_splitter_exports = {};
__export(tweet_batch_splitter_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(tweet_batch_splitter_exports);
function calculateTweetAgeInDays(tweetCreatedAt) {
  const now = /* @__PURE__ */ new Date();
  const tweetDate = new Date(tweetCreatedAt);
  const ageInMs = now.getTime() - tweetDate.getTime();
  return ageInMs / (24 * 60 * 60 * 1e3);
}
function createPrioritizedBatches(tweets) {
  const batches = [];
  const highPriorityTweets = [];
  const mediumPriorityTweets = [];
  const lowPriorityTweets = [];
  for (const tweet of tweets) {
    const ageInDays = calculateTweetAgeInDays(tweet.created_at);
    if (ageInDays < 2) {
      highPriorityTweets.push(tweet);
    } else if (ageInDays < 4) {
      mediumPriorityTweets.push(tweet);
    } else {
      lowPriorityTweets.push(tweet);
    }
  }
  console.log(`\u{1F4CA} [PRIORITY] HIGH: ${highPriorityTweets.length}\uAC1C, MEDIUM: ${mediumPriorityTweets.length}\uAC1C, LOW: ${lowPriorityTweets.length}\uAC1C`);
  const totalBatches = tweets.length;
  const waitSeconds = Math.ceil(900 * totalBatches / 5);
  console.log(`\u23F1\uFE0F  [DYNAMIC_WAIT] ${totalBatches}\uAC1C \uBC30\uCE58 \u2192 ${waitSeconds}\uCD08 (${(waitSeconds / 60).toFixed(1)}\uBD84) \uB300\uAE30`);
  console.log(`   \u{1F4CA} Rate Limit \uC0AC\uC6A9\uB7C9: ${totalBatches}/5 calls per 15min`);
  for (const tweet of highPriorityTweets) {
    batches.push({
      tweets: [tweet],
      batchIndex: batches.length,
      totalBatches: 0,
      // 나중에 업데이트
      priority: "HIGH",
      maxResults: 100,
      collectionStrategy: "FULL",
      waitAfterLikesSeconds: waitSeconds,
      // 🆕 동적 대기 시간
      waitAfterRetweetsSeconds: waitSeconds
      // 🆕 동적 대기 시간
    });
  }
  for (const tweet of mediumPriorityTweets) {
    batches.push({
      tweets: [tweet],
      batchIndex: batches.length,
      totalBatches: 0,
      priority: "MEDIUM",
      maxResults: 80,
      collectionStrategy: "ENHANCED",
      waitAfterLikesSeconds: waitSeconds,
      // 🆕 동적 대기 시간
      waitAfterRetweetsSeconds: waitSeconds
      // 🆕 동적 대기 시간
    });
  }
  for (const tweet of lowPriorityTweets) {
    batches.push({
      tweets: [tweet],
      batchIndex: batches.length,
      totalBatches: 0,
      priority: "LOW",
      maxResults: 50,
      collectionStrategy: "SAMPLING",
      waitAfterLikesSeconds: waitSeconds,
      // 🆕 동적 대기 시간
      waitAfterRetweetsSeconds: waitSeconds
      // 🆕 동적 대기 시간
    });
  }
  batches.forEach((batch) => {
    batch.totalBatches = batches.length;
  });
  return batches;
}
var handler = async (event) => {
  const startTime = Date.now();
  console.log("\u{1F680} [TWEET_BATCH_SPLITTER_V3_ENHANCED] \uC2DC\uC791:", JSON.stringify(event, null, 2));
  try {
    let tweets;
    let targetUser;
    let dateRange;
    let collectionDate;
    if (event.tweets && Array.isArray(event.tweets)) {
      tweets = event.tweets;
      targetUser = event.targetUser;
      dateRange = event.dateRange;
      collectionDate = event.collectionDate || event.targetDate;
      console.log("\u2705 [INPUT] V3 \uC9C1\uC811 \uD615\uC2DD \uAC10\uC9C0");
    } else if (event.getTargetTweetsResult?.Payload?.tweets) {
      tweets = event.getTargetTweetsResult.Payload.tweets;
      targetUser = event.getTargetTweetsResult.Payload.targetUser;
      dateRange = event.getTargetTweetsResult.Payload.dateRange;
      collectionDate = event.getTargetTweetsResult.Payload.collectionDate || event.targetDate;
      console.log("\u2705 [INPUT] V2 GetTargetTweets \uD615\uC2DD \uAC10\uC9C0");
    } else {
      throw new Error("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC785\uB825: tweets \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4 (event.tweets \uB610\uB294 event.getTargetTweetsResult.Payload.tweets)");
    }
    if (!tweets || !Array.isArray(tweets)) {
      throw new Error("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC785\uB825: tweets \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4");
    }
    if (!targetUser || !targetUser.id) {
      throw new Error("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC785\uB825: targetUser \uC815\uBCF4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4");
    }
    console.log(`\u{1F4CA} [BATCH_SPLITTER] \uCD1D ${tweets.length}\uAC1C \uD2B8\uC717 \uC6B0\uC120\uC21C\uC704 \uAE30\uBC18 \uBC30\uCE58 \uBD84\uD560 \uC2DC\uC791`);
    const tweetBatches = createPrioritizedBatches(tweets);
    for (const batch of tweetBatches) {
      const tweet = batch.tweets[0];
      const age = calculateTweetAgeInDays(tweet.created_at);
      console.log(
        `\u{1F4E6} [BATCH_${batch.batchIndex}] ${batch.priority} priority | maxResults: ${batch.maxResults} | age: ${age.toFixed(1)}\uC77C | strategy: ${batch.collectionStrategy}`
      );
    }
    const result = {
      success: true,
      tweetBatches,
      totalTweets: tweets.length,
      totalBatches: tweetBatches.length,
      targetUser,
      dateRange,
      collectionDate,
      splitTimestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      const { CloudWatchClient, PutMetricDataCommand } = await import("@aws-sdk/client-cloudwatch");
      const cloudWatch = new CloudWatchClient({ region: "ap-northeast-2" });
      await cloudWatch.send(new PutMetricDataCommand({
        Namespace: "NASUN/StepFunctions/BatchSplitter",
        MetricData: [
          {
            MetricName: "TotalTweets",
            Value: tweets.length,
            Unit: "Count",
            Timestamp: /* @__PURE__ */ new Date()
          },
          {
            MetricName: "TotalBatches",
            Value: tweetBatches.length,
            Unit: "Count",
            Timestamp: /* @__PURE__ */ new Date()
          },
          {
            MetricName: "ProcessingDuration",
            Value: Date.now() - startTime,
            Unit: "Milliseconds",
            Timestamp: /* @__PURE__ */ new Date()
          }
        ]
      }));
    } catch (metricsError) {
      console.warn("\u26A0\uFE0F [METRICS] CloudWatch \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:", metricsError);
    }
    console.log(`\u2705 [BATCH_SPLITTER_ENHANCED] \uC131\uACF5\uC801\uC73C\uB85C \uC644\uB8CC: ${tweetBatches.length}\uAC1C \uC6B0\uC120\uC21C\uC704 \uBC30\uCE58 \uC0DD\uC131`);
    console.log("\u{1F4CB} [RESULT]:", JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error("\u274C [BATCH_SPLITTER] \uC624\uB958 \uBC1C\uC0DD:", error);
    try {
      const { CloudWatchClient, PutMetricDataCommand } = await import("@aws-sdk/client-cloudwatch");
      const cloudWatch = new CloudWatchClient({ region: "ap-northeast-2" });
      await cloudWatch.send(new PutMetricDataCommand({
        Namespace: "NASUN/StepFunctions/BatchSplitter",
        MetricData: [
          {
            MetricName: "ErrorCount",
            Value: 1,
            Unit: "Count",
            Timestamp: /* @__PURE__ */ new Date()
          }
        ]
      }));
    } catch (metricsError) {
      console.warn("\u26A0\uFE0F [METRICS] \uC624\uB958 \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:", metricsError);
    }
    throw error;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=tweet-batch-splitter.js.map
