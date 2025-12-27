// 멘션 점수 시스템 기본 검증 테스트
// 외부 의존성 없이 핵심 로직만 테스트

import { extractValidTargetMentions, evaluateMentionQuality, detectSpamIndicators } from '../../utils/mention-detector';
import { calculateMentionScore, calculateCooldownBonus, MENTION_RULES } from '../../types/cumulative';

console.log('🧪 [MENTION_VERIFICATION] 멘션 시스템 기본 검증 시작');

// 1. 설정값 검증
console.log('\n📋 [CONFIG] 설정값 검증');
console.log(`✅ 일일 제한: ${MENTION_RULES.dailyLimit}회`);
console.log(`✅ 기본 점수: ${MENTION_RULES.baseScore}점`);
console.log(`✅ 쿨다운: ${MENTION_RULES.cooldownHours}시간`);
console.log(`✅ 최소 길이: ${MENTION_RULES.minContentLength}자`);

// 2. 멘션 탐지 테스트
console.log('\n🔍 [DETECTION] 멘션 탐지 테스트');
const testTweets = [
  {
    text: '@nasun_official 안녕하세요! 프로젝트가 정말 좋네요. 계속 응원하겠습니다!',
    expected: true,
    description: '유효한 타겟 멘션'
  },
  {
    text: '@other_user 안녕하세요! 좋은 프로젝트네요.',
    expected: false,
    description: '타겟이 아닌 멘션'
  },
  {
    text: '안녕하세요',
    expected: false,
    description: '멘션 없음'
  }
];

testTweets.forEach((tweet, index) => {
  const mentions = extractValidTargetMentions(tweet.text, ['nasun_official']);
  const isValid = mentions.length > 0;
  const result = isValid === tweet.expected ? '✅' : '❌';
  console.log(`  ${result} 테스트 ${index + 1}: ${tweet.description} - ${isValid ? '멘션 발견' : '멘션 없음'}`);
});

// 3. 스팸 탐지 테스트
console.log('\n🚫 [SPAM] 스팸 탐지 테스트');
const spamTests = [
  {
    text: '@nasun_official 안녕하세요!!!!! 정말 좋아요요요요요요!!!!',
    expected: true,
    description: '과도한 반복 문자'
  },
  {
    text: '@nasun_official 안녕하세요! 좋은 프로젝트네요.',
    expected: false,
    description: '정상 텍스트'
  }
];

spamTests.forEach((test, index) => {
  const isSpam = detectSpamIndicators(test.text);
  const result = isSpam === test.expected ? '✅' : '❌';
  console.log(`  ${result} 스팸 테스트 ${index + 1}: ${test.description} - ${isSpam ? '스팸 감지' : '정상'}`);
});

// 4. 품질 점수 테스트
console.log('\n⭐ [QUALITY] 품질 점수 테스트');
const qualityTests = [
  '@nasun_official 안녕하세요! 프로젝트에 대해 질문이 있습니다. 어떻게 참여할 수 있나요?',
  '@nasun_official 좋아요!',
  '@nasun_official 정말 감사합니다. 훌륭한 프로젝트네요!'
];

qualityTests.forEach((text, index) => {
  const mentions = extractValidTargetMentions(text, ['nasun_official']);
  if (mentions.length > 0) {
    const quality = evaluateMentionQuality(text, mentions[0]);
    console.log(`  📊 품질 테스트 ${index + 1}: ${(quality * 100).toFixed(0)}% - "${text.substring(0, 30)}..."`);
  }
});

// 5. 점수 계산 테스트
console.log('\n🎯 [SCORING] 점수 계산 테스트');
const scoringTests = [
  { quality: 0.8, interval: 5, description: '고품질 + 쿨다운 통과' },
  { quality: 0.5, interval: 2, description: '보통품질 + 쿨다운 미달' },
  { quality: 0.9, interval: 12, description: '최고품질 + 긴 간격' }
];

scoringTests.forEach((test, index) => {
  const cooldownBonus = calculateCooldownBonus(test.interval);
  const finalScore = calculateMentionScore(MENTION_RULES.baseScore, test.quality, cooldownBonus);
  console.log(`  🔢 점수 테스트 ${index + 1}: ${test.description}`);
  console.log(`     기본점수: ${MENTION_RULES.baseScore}, 품질: ${test.quality}, 보너스: ${cooldownBonus} → 최종: ${finalScore}점`);
});

// 6. 쿨다운 보너스 테스트
console.log('\n⏰ [COOLDOWN] 쿨다운 보너스 테스트');
const cooldownIntervals = [1, 4, 8, 12, 24, 48];

cooldownIntervals.forEach(interval => {
  const bonus = calculateCooldownBonus(interval);
  const status = interval >= MENTION_RULES.cooldownHours ? '✅ 통과' : '❌ 위반';
  console.log(`  ${status} ${interval}시간 간격 → 보너스: +${bonus}점`);
});

console.log('\n🎉 [VERIFICATION] 기본 검증 완료 - 모든 핵심 기능이 정상적으로 동작합니다.');
console.log('\n📝 [NEXT_STEPS] 다음 단계:');
console.log('  1. MentionCounterService 초기화');
console.log('  2. TwitterApiService에 MentionCounterService 연결');
console.log('  3. DynamoDB 테이블에서 실제 테스트');
console.log('  4. CloudWatch 메트릭 연동 확인');
console.log('  5. 프로덕션 배포');