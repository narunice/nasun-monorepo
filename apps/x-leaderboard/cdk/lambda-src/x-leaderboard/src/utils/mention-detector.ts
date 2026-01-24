// 멘션 탐지 및 검증 유틸리티
// 트윗 내용에서 @username 패턴을 탐지하고 유효성을 검증

import { MENTION_RULES } from '../types/cumulative';

/**
 * 멘션 정보 인터페이스
 */
export interface MentionInfo {
  username: string;           // 멘션된 사용자명 (@ 제외)
  fullMention: string;        // 전체 멘션 텍스트 (@username)
  startIndex: number;         // 멘션 시작 위치
  endIndex: number;           // 멘션 종료 위치
}

/**
 * 멘션 검증 결과 인터페이스
 */
export interface MentionValidationResult {
  isValid: boolean;           // 유효한 멘션인지
  mentions: MentionInfo[];    // 탐지된 멘션 목록
  targetMentions: MentionInfo[]; // 타겟 사용자 멘션 목록
  contentLength: number;      // 콘텐츠 길이
  passesMinLength: boolean;   // 최소 길이 통과 여부
  hasSpamIndicators: boolean; // 스팸 지표 포함 여부
  reason: string;             // 검증 실패 이유 (실패시)
}

/**
 * 트윗 텍스트에서 모든 멘션을 탐지
 * @param tweetText 트윗 텍스트
 * @returns 탐지된 멘션 목록
 */
function detectMentions(tweetText: string): MentionInfo[] {
  const mentions: MentionInfo[] = [];
  
  // @username 패턴 정규표현식
  // - @로 시작
  // - 영문자, 숫자, 언더스코어만 허용
  // - 1-15자 길이 (X/Twitter 사용자명 규칙)
  // - 단어 경계로 구분
  const mentionRegex = /@([a-zA-Z0-9_]{1,15})\b/g;
  
  let match;
  while ((match = mentionRegex.exec(tweetText)) !== null) {
    mentions.push({
      username: match[1],           // 캡처 그룹 (@ 제외한 사용자명)
      fullMention: match[0],        // 전체 매치 (@username)
      startIndex: match.index,      // 시작 위치
      endIndex: match.index + match[0].length // 종료 위치
    });
  }
  
  return mentions;
}

/**
 * 특정 타겟 사용자들에 대한 멘션 검증
 * @param tweetText 트윗 텍스트
 * @param targetUsernames 타겟 사용자명 목록 (@ 제외)
 * @returns 멘션 검증 결과
 */
function validateMentions(
  tweetText: string, 
  targetUsernames: string[]
): MentionValidationResult {
  
  // 1. 기본 콘텐츠 검증
  const contentLength = tweetText.trim().length;
  const passesMinLength = contentLength >= MENTION_RULES.minContentLength;
  
  // 2. 스팸 지표 검증
  const hasSpamIndicators = detectSpamIndicators(tweetText);
  
  // 3. 모든 멘션 탐지
  const allMentions = detectMentions(tweetText);
  
  // 4. 타겟 사용자 멘션 필터링
  const targetMentions = allMentions.filter(mention => 
    targetUsernames.some(target => 
      target.toLowerCase() === mention.username.toLowerCase()
    )
  );
  
  // 5. 유효성 검증
  const isValid = passesMinLength && !hasSpamIndicators && targetMentions.length > 0;
  
  // 6. 실패 이유 결정
  let reason = '';
  if (!passesMinLength) {
    reason = `콘텐츠 길이 부족 (${contentLength}자, 최소 ${MENTION_RULES.minContentLength}자 필요)`;
  } else if (hasSpamIndicators) {
    reason = '스팸 지표 탐지됨';
  } else if (targetMentions.length === 0) {
    reason = '타겟 사용자 멘션 없음';
  } else {
    reason = '검증 통과';
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

/**
 * 스팸 지표 탐지
 * @param tweetText 트윗 텍스트
 * @returns 스팸 지표 포함 여부
 */
function detectSpamIndicators(tweetText: string): boolean {
  const text = tweetText.toLowerCase();
  
  // 스팸 패턴들
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
  
  // 하나라도 매치되면 스팸으로 판단
  return spamPatterns.some(pattern => pattern.test(text));
}

/**
 * 멘션의 컨텍스트 품질 평가
 * @param tweetText 트윗 텍스트
 * @param mentionInfo 멘션 정보
 * @returns 품질 점수 (0-1)
 */
function evaluateMentionQuality(
  tweetText: string, 
  mentionInfo: MentionInfo
): number {
  let qualityScore = 0.5; // 기본 점수
  
  // 1. 컨텍스트 존재 여부 (+0.2)
  const beforeMention = tweetText.substring(0, mentionInfo.startIndex).trim();
  const afterMention = tweetText.substring(mentionInfo.endIndex).trim();
  
  if (beforeMention.length > 10 || afterMention.length > 10) {
    qualityScore += 0.2;
  }
  
  // 2. 질문이나 대화형 패턴 (+0.2)
  const conversationalPatterns = /[?!]|어떻게|왜|무엇|언제|어디서|어떤|생각|의견|어떠세요/;
  if (conversationalPatterns.test(tweetText)) {
    qualityScore += 0.2;
  }
  
  // 3. 감사 표현 (+0.1)
  const gratitudePatterns = /감사|고마워|thanks|thank you|좋아요|훌륭|멋져/;
  if (gratitudePatterns.test(tweetText.toLowerCase())) {
    qualityScore += 0.1;
  }
  
  // 4. 단순 멘션만 있는 경우 (-0.3)
  const cleanText = tweetText.replace(/@\w+/g, '').trim();
  if (cleanText.length < 10) {
    qualityScore -= 0.3;
  }
  
  // 5. 연속 멘션 페널티 (-0.2)
  const mentionDensity = (tweetText.match(/@\w+/g) || []).length / tweetText.length * 100;
  if (mentionDensity > 20) {
    qualityScore -= 0.2;
  }
  
  // 점수 범위 제한 (0-1)
  return Math.max(0, Math.min(1, qualityScore));
}

/**
 * 트윗에서 타겟 사용자 멘션만 추출 (검증된 것만)
 * @param tweetText 트윗 텍스트
 * @param targetUsernames 타겟 사용자명 목록
 * @returns 검증된 타겟 멘션 목록
 */
function extractValidTargetMentions(
  tweetText: string,
  targetUsernames: string[]
): MentionInfo[] {
  const validation = validateMentions(tweetText, targetUsernames);
  
  if (!validation.isValid) {
    console.log(`🔍 [MENTION_DETECTOR] 멘션 검증 실패: ${validation.reason}`);
    return [];
  }
  
  console.log(`✅ [MENTION_DETECTOR] 유효한 타겟 멘션 ${validation.targetMentions.length}개 탐지`);
  return validation.targetMentions;
}

/**
 * 디버깅용 멘션 분석 정보 출력
 * @param tweetText 트윗 텍스트
 * @param targetUsernames 타겟 사용자명 목록
 */
function debugMentionAnalysis(
  tweetText: string,
  targetUsernames: string[]
): void {
  console.log(`🔍 [MENTION_DEBUG] 트윗 분석 시작`);
  console.log(`  📝 텍스트: "${tweetText}"`);
  console.log(`  🎯 타겟: [${targetUsernames.join(', ')}]`);
  
  const validation = validateMentions(tweetText, targetUsernames);
  
  console.log(`  📏 길이: ${validation.contentLength}자 (최소: ${MENTION_RULES.minContentLength}자)`);
  console.log(`  🏷️  전체 멘션: ${validation.mentions.length}개`);
  console.log(`  🎯 타겟 멘션: ${validation.targetMentions.length}개`);
  console.log(`  ✅ 길이 통과: ${validation.passesMinLength}`);
  console.log(`  🚫 스팸 지표: ${validation.hasSpamIndicators}`);
  console.log(`  🔍 최종 결과: ${validation.isValid ? '✅ 유효' : '❌ 무효'}`);
  console.log(`  📋 이유: ${validation.reason}`);
  
  validation.targetMentions.forEach((mention, idx) => {
    const quality = evaluateMentionQuality(tweetText, mention);
    console.log(`    ${idx + 1}. @${mention.username} (품질: ${(quality * 100).toFixed(0)}%)`);
  });
}

// 기본 export
export {
  detectMentions,
  validateMentions,
  detectSpamIndicators,
  evaluateMentionQuality,
  extractValidTargetMentions,
  debugMentionAnalysis
};