"use strict";

// src/types/cumulative.ts
var MENTION_RULES = {
  dailyLimit: 3,
  // 일일 멘션 제한: 3개
  baseScore: 2.5,
  // 기본 점수: 2.5점 (2.3 → 2.5 상향 조정)
  cooldownHours: 4,
  // 쿨다운: 4시간
  minContentLength: 20,
  // 최소 콘텐츠 길이: 20자
  ttlDays: 365,
  // TTL: 1년 (환경변수로 변경 예정)
  currentVersion: "v2"
  // 버전: v2
};
function calculateMentionScore(baseScore = MENTION_RULES.baseScore, qualityMultiplier = 1, cooldownBonus = 0) {
  const finalScore = baseScore * qualityMultiplier + cooldownBonus;
  return Math.round(finalScore * 10) / 10;
}
function calculateMentionCooldownBonus(intervalHours) {
  if (intervalHours >= 24) return 0.5;
  if (intervalHours >= 12) return 0.4;
  if (intervalHours >= 8) return 0.3;
  if (intervalHours >= MENTION_RULES.cooldownHours) return 0.1;
  return 0;
}
function calculateCooldownBonus(intervalHours) {
  return calculateMentionCooldownBonus(intervalHours);
}

// src/utils/mention-detector.ts
function detectMentions(tweetText) {
  const mentions = [];
  const mentionRegex = /@([a-zA-Z0-9_]{1,15})\b/g;
  let match;
  while ((match = mentionRegex.exec(tweetText)) !== null) {
    mentions.push({
      username: match[1],
      // 캡처 그룹 (@ 제외한 사용자명)
      fullMention: match[0],
      // 전체 매치 (@username)
      startIndex: match.index,
      // 시작 위치
      endIndex: match.index + match[0].length
      // 종료 위치
    });
  }
  return mentions;
}
function validateMentions(tweetText, targetUsernames) {
  const contentLength = tweetText.trim().length;
  const passesMinLength = contentLength >= MENTION_RULES.minContentLength;
  const hasSpamIndicators = detectSpamIndicators(tweetText);
  const allMentions = detectMentions(tweetText);
  const targetMentions = allMentions.filter(
    (mention) => targetUsernames.some(
      (target) => target.toLowerCase() === mention.username.toLowerCase()
    )
  );
  const isValid = passesMinLength && !hasSpamIndicators && targetMentions.length > 0;
  let reason = "";
  if (!passesMinLength) {
    reason = `\uCF58\uD150\uCE20 \uAE38\uC774 \uBD80\uC871 (${contentLength}\uC790, \uCD5C\uC18C ${MENTION_RULES.minContentLength}\uC790 \uD544\uC694)`;
  } else if (hasSpamIndicators) {
    reason = "\uC2A4\uD338 \uC9C0\uD45C \uD0D0\uC9C0\uB428";
  } else if (targetMentions.length === 0) {
    reason = "\uD0C0\uAC9F \uC0AC\uC6A9\uC790 \uBA58\uC158 \uC5C6\uC74C";
  } else {
    reason = "\uAC80\uC99D \uD1B5\uACFC";
  }
  return {
    isValid,
    mentions: allMentions,
    targetMentions,
    contentLength,
    passesMinLength,
    hasSpamIndicators,
    reason
  };
}
function detectSpamIndicators(tweetText) {
  const text = tweetText.toLowerCase();
  const spamPatterns = [
    // 1. 과도한 반복 문자 (3개 이상 연속)
    /(.)\1{3,}/,
    // 2. 과도한 해시태그 (5개 이상)
    /(#\w+.*){5,}/,
    // 3. 과도한 멘션 (5개 이상)
    /(@\w+.*){5,}/,
    // 4. 스팸성 키워드
    /팔로우.*팔로우|follow.*follow|구독.*구독|광고|홍보|무료|이벤트.*참여/,
    // 5. URL 단축 서비스 (의심스러운 경우)
    /(bit\.ly|tinyurl|t\.co).{3,}/,
    // 6. 과도한 특수 문자 패턴 (5개 이상 연속)
    /[!@#$%^&*()]{5,}/
  ];
  return spamPatterns.some((pattern) => pattern.test(text));
}
function evaluateMentionQuality(tweetText, mentionInfo) {
  let qualityScore = 0.5;
  const beforeMention = tweetText.substring(0, mentionInfo.startIndex).trim();
  const afterMention = tweetText.substring(mentionInfo.endIndex).trim();
  if (beforeMention.length > 10 || afterMention.length > 10) {
    qualityScore += 0.2;
  }
  const conversationalPatterns = /[?!]|어떻게|왜|무엇|언제|어디서|어떤|생각|의견|어떠세요/;
  if (conversationalPatterns.test(tweetText)) {
    qualityScore += 0.2;
  }
  const gratitudePatterns = /감사|고마워|thanks|thank you|좋아요|훌륭|멋져/;
  if (gratitudePatterns.test(tweetText.toLowerCase())) {
    qualityScore += 0.1;
  }
  const cleanText = tweetText.replace(/@\w+/g, "").trim();
  if (cleanText.length < 10) {
    qualityScore -= 0.3;
  }
  const mentionDensity = (tweetText.match(/@\w+/g) || []).length / tweetText.length * 100;
  if (mentionDensity > 20) {
    qualityScore -= 0.2;
  }
  return Math.max(0, Math.min(1, qualityScore));
}
function extractValidTargetMentions(tweetText, targetUsernames) {
  const validation = validateMentions(tweetText, targetUsernames);
  if (!validation.isValid) {
    console.log(`\u{1F50D} [MENTION_DETECTOR] \uBA58\uC158 \uAC80\uC99D \uC2E4\uD328: ${validation.reason}`);
    return [];
  }
  console.log(`\u2705 [MENTION_DETECTOR] \uC720\uD6A8\uD55C \uD0C0\uAC9F \uBA58\uC158 ${validation.targetMentions.length}\uAC1C \uD0D0\uC9C0`);
  return validation.targetMentions;
}

// src/handlers/test/mention-verification.ts
console.log("\u{1F9EA} [MENTION_VERIFICATION] \uBA58\uC158 \uC2DC\uC2A4\uD15C \uAE30\uBCF8 \uAC80\uC99D \uC2DC\uC791");
console.log("\n\u{1F4CB} [CONFIG] \uC124\uC815\uAC12 \uAC80\uC99D");
console.log(`\u2705 \uC77C\uC77C \uC81C\uD55C: ${MENTION_RULES.dailyLimit}\uD68C`);
console.log(`\u2705 \uAE30\uBCF8 \uC810\uC218: ${MENTION_RULES.baseScore}\uC810`);
console.log(`\u2705 \uCFE8\uB2E4\uC6B4: ${MENTION_RULES.cooldownHours}\uC2DC\uAC04`);
console.log(`\u2705 \uCD5C\uC18C \uAE38\uC774: ${MENTION_RULES.minContentLength}\uC790`);
console.log("\n\u{1F50D} [DETECTION] \uBA58\uC158 \uD0D0\uC9C0 \uD14C\uC2A4\uD2B8");
var testTweets = [
  {
    text: "@nasun_official \uC548\uB155\uD558\uC138\uC694! \uD504\uB85C\uC81D\uD2B8\uAC00 \uC815\uB9D0 \uC88B\uB124\uC694. \uACC4\uC18D \uC751\uC6D0\uD558\uACA0\uC2B5\uB2C8\uB2E4!",
    expected: true,
    description: "\uC720\uD6A8\uD55C \uD0C0\uAC9F \uBA58\uC158"
  },
  {
    text: "@other_user \uC548\uB155\uD558\uC138\uC694! \uC88B\uC740 \uD504\uB85C\uC81D\uD2B8\uB124\uC694.",
    expected: false,
    description: "\uD0C0\uAC9F\uC774 \uC544\uB2CC \uBA58\uC158"
  },
  {
    text: "\uC548\uB155\uD558\uC138\uC694",
    expected: false,
    description: "\uBA58\uC158 \uC5C6\uC74C"
  }
];
testTweets.forEach((tweet, index) => {
  const mentions = extractValidTargetMentions(tweet.text, ["nasun_official"]);
  const isValid = mentions.length > 0;
  const result = isValid === tweet.expected ? "\u2705" : "\u274C";
  console.log(`  ${result} \uD14C\uC2A4\uD2B8 ${index + 1}: ${tweet.description} - ${isValid ? "\uBA58\uC158 \uBC1C\uACAC" : "\uBA58\uC158 \uC5C6\uC74C"}`);
});
console.log("\n\u{1F6AB} [SPAM] \uC2A4\uD338 \uD0D0\uC9C0 \uD14C\uC2A4\uD2B8");
var spamTests = [
  {
    text: "@nasun_official \uC548\uB155\uD558\uC138\uC694!!!!! \uC815\uB9D0 \uC88B\uC544\uC694\uC694\uC694\uC694\uC694\uC694!!!!",
    expected: true,
    description: "\uACFC\uB3C4\uD55C \uBC18\uBCF5 \uBB38\uC790"
  },
  {
    text: "@nasun_official \uC548\uB155\uD558\uC138\uC694! \uC88B\uC740 \uD504\uB85C\uC81D\uD2B8\uB124\uC694.",
    expected: false,
    description: "\uC815\uC0C1 \uD14D\uC2A4\uD2B8"
  }
];
spamTests.forEach((test, index) => {
  const isSpam = detectSpamIndicators(test.text);
  const result = isSpam === test.expected ? "\u2705" : "\u274C";
  console.log(`  ${result} \uC2A4\uD338 \uD14C\uC2A4\uD2B8 ${index + 1}: ${test.description} - ${isSpam ? "\uC2A4\uD338 \uAC10\uC9C0" : "\uC815\uC0C1"}`);
});
console.log("\n\u2B50 [QUALITY] \uD488\uC9C8 \uC810\uC218 \uD14C\uC2A4\uD2B8");
var qualityTests = [
  "@nasun_official \uC548\uB155\uD558\uC138\uC694! \uD504\uB85C\uC81D\uD2B8\uC5D0 \uB300\uD574 \uC9C8\uBB38\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uC5B4\uB5BB\uAC8C \uCC38\uC5EC\uD560 \uC218 \uC788\uB098\uC694?",
  "@nasun_official \uC88B\uC544\uC694!",
  "@nasun_official \uC815\uB9D0 \uAC10\uC0AC\uD569\uB2C8\uB2E4. \uD6CC\uB96D\uD55C \uD504\uB85C\uC81D\uD2B8\uB124\uC694!"
];
qualityTests.forEach((text, index) => {
  const mentions = extractValidTargetMentions(text, ["nasun_official"]);
  if (mentions.length > 0) {
    const quality = evaluateMentionQuality(text, mentions[0]);
    console.log(`  \u{1F4CA} \uD488\uC9C8 \uD14C\uC2A4\uD2B8 ${index + 1}: ${(quality * 100).toFixed(0)}% - "${text.substring(0, 30)}..."`);
  }
});
console.log("\n\u{1F3AF} [SCORING] \uC810\uC218 \uACC4\uC0B0 \uD14C\uC2A4\uD2B8");
var scoringTests = [
  { quality: 0.8, interval: 5, description: "\uACE0\uD488\uC9C8 + \uCFE8\uB2E4\uC6B4 \uD1B5\uACFC" },
  { quality: 0.5, interval: 2, description: "\uBCF4\uD1B5\uD488\uC9C8 + \uCFE8\uB2E4\uC6B4 \uBBF8\uB2EC" },
  { quality: 0.9, interval: 12, description: "\uCD5C\uACE0\uD488\uC9C8 + \uAE34 \uAC04\uACA9" }
];
scoringTests.forEach((test, index) => {
  const cooldownBonus = calculateCooldownBonus(test.interval);
  const finalScore = calculateMentionScore(MENTION_RULES.baseScore, test.quality, cooldownBonus);
  console.log(`  \u{1F522} \uC810\uC218 \uD14C\uC2A4\uD2B8 ${index + 1}: ${test.description}`);
  console.log(`     \uAE30\uBCF8\uC810\uC218: ${MENTION_RULES.baseScore}, \uD488\uC9C8: ${test.quality}, \uBCF4\uB108\uC2A4: ${cooldownBonus} \u2192 \uCD5C\uC885: ${finalScore}\uC810`);
});
console.log("\n\u23F0 [COOLDOWN] \uCFE8\uB2E4\uC6B4 \uBCF4\uB108\uC2A4 \uD14C\uC2A4\uD2B8");
var cooldownIntervals = [1, 4, 8, 12, 24, 48];
cooldownIntervals.forEach((interval) => {
  const bonus = calculateCooldownBonus(interval);
  const status = interval >= MENTION_RULES.cooldownHours ? "\u2705 \uD1B5\uACFC" : "\u274C \uC704\uBC18";
  console.log(`  ${status} ${interval}\uC2DC\uAC04 \uAC04\uACA9 \u2192 \uBCF4\uB108\uC2A4: +${bonus}\uC810`);
});
console.log("\n\u{1F389} [VERIFICATION] \uAE30\uBCF8 \uAC80\uC99D \uC644\uB8CC - \uBAA8\uB4E0 \uD575\uC2EC \uAE30\uB2A5\uC774 \uC815\uC0C1\uC801\uC73C\uB85C \uB3D9\uC791\uD569\uB2C8\uB2E4.");
console.log("\n\u{1F4DD} [NEXT_STEPS] \uB2E4\uC74C \uB2E8\uACC4:");
console.log("  1. MentionCounterService \uCD08\uAE30\uD654");
console.log("  2. TwitterApiService\uC5D0 MentionCounterService \uC5F0\uACB0");
console.log("  3. DynamoDB \uD14C\uC774\uBE14\uC5D0\uC11C \uC2E4\uC81C \uD14C\uC2A4\uD2B8");
console.log("  4. CloudWatch \uBA54\uD2B8\uB9AD \uC5F0\uB3D9 \uD655\uC778");
console.log("  5. \uD504\uB85C\uB355\uC158 \uBC30\uD3EC");
//# sourceMappingURL=mention-verification.js.map
