// Quote Quality Evaluator - 인용 트윗 품질 평가 유틸리티
// 간단한 스팸 검증과 최소 길이 검증만 수행

import { QUOTE_RULES } from '../types/cumulative';

/**
 * 품질 평가 결과 인터페이스
 */
export interface QuoteQualityResult {
  isValid: boolean;              // 최소 기준 통과 여부
  qualityScore: number;          // 품질 점수 (0-1, 스팸이 아니면 1.0)
  spamScore: number;            // 스팸 점수 (0-1, 높을수록 스팸 의심)
  issues: string[];             // 품질 이슈 목록
  breakdown: {
    contentLength: number;       // 콘텐츠 길이
    spamPatterns: string[];     // 감지된 스팸 패턴
  };
}

/**
 * 스팸 패턴 정의
 */
const SPAM_PATTERNS = {
  // 반복 문자 패턴 (5회 이상)
  repeatedChars: /(.)\1{4,}/g,
  
  // 과도한 해시태그 (4개 이상)
  excessiveHashtags: /#\w+.*#\w+.*#\w+.*#\w+/g,
  
  // 과도한 멘션 (4개 이상)
  excessiveMentions: /@\w+.*@\w+.*@\w+.*@\w+/g,
  
  // 의미 없는 문자열 (특수문자만으로 구성)
  meaninglessText: /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`\s]+$/,
  
  // 과도한 특수문자 (연속 10개 이상)
  excessiveSpecialChars: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]{10,}/g
};

/**
 * 스팸 키워드 목록
 */
const SPAM_KEYWORDS = [
  // 홍보성 키워드
  '팔로우', 'follow', '맞팔', '광고', 'ad', 
  '할인', 'discount', '무료', 'free', '이벤트', 'event',
  '쿠폰', 'coupon', '당첨', '추첨', '홍보', 'promo'
];

/**
 * 인용 트윗 품질 평가 함수 (단순화된 버전)
 * @param quoteText 인용 트윗 내용
 * @param originalText 원본 트윗 내용 (사용하지 않음)
 * @returns QuoteQualityResult
 */
export function evaluateQuoteQuality(
  quoteText: string,
  originalText: string = ""
): QuoteQualityResult {
  const issues: string[] = [];
  const breakdown = {
    contentLength: 0,
    spamPatterns: [] as string[]
  };

  // 1. 기본 길이 검증
  const trimmedQuote = quoteText.trim();
  
  if (trimmedQuote.length < QUOTE_RULES.minContentLength) {
    issues.push(`최소 길이 미달 (${QUOTE_RULES.minContentLength}자 필요, ${trimmedQuote.length}자 제공)`);
    return {
      isValid: false,
      qualityScore: 0,
      spamScore: 1.0,
      issues,
      breakdown
    };
  }

  breakdown.contentLength = trimmedQuote.length;

  // 2. 스팸 패턴 검사
  let spamScore = 0;
  
  // 반복 문자 검사
  if (SPAM_PATTERNS.repeatedChars.test(trimmedQuote)) {
    breakdown.spamPatterns.push('반복 문자');
    spamScore += 0.3;
  }
  
  // 과도한 해시태그 검사
  if (SPAM_PATTERNS.excessiveHashtags.test(trimmedQuote)) {
    breakdown.spamPatterns.push('과도한 해시태그');
    spamScore += 0.4;
  }
  
  // 과도한 멘션 검사
  if (SPAM_PATTERNS.excessiveMentions.test(trimmedQuote)) {
    breakdown.spamPatterns.push('과도한 멘션');
    spamScore += 0.4;
  }
  
  // 의미 없는 문자열 검사
  if (SPAM_PATTERNS.meaninglessText.test(trimmedQuote)) {
    breakdown.spamPatterns.push('의미 없는 문자열');
    spamScore += 0.6;
  }
  
  // 과도한 특수문자 검사
  if (SPAM_PATTERNS.excessiveSpecialChars.test(trimmedQuote)) {
    breakdown.spamPatterns.push('과도한 특수문자');
    spamScore += 0.3;
  }
  
  // 스팸 키워드 검사
  const lowerText = trimmedQuote.toLowerCase();
  let spamKeywordCount = 0;
  for (const keyword of SPAM_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      spamKeywordCount++;
    }
  }
  
  if (spamKeywordCount >= 2) {
    breakdown.spamPatterns.push('스팸 키워드');
    spamScore += 0.4;
  }

  // 스팸 점수 정규화 (0-1)
  spamScore = Math.min(spamScore, 1.0);

  // 3. 최종 품질 점수 계산 (스팸은 점수 안 줌, 정상은 최대 3.4점)
  let qualityScore = 1.0;
  
  // 스팸이 감지되면 점수를 주지 않음
  if (spamScore > 0.5) {
    qualityScore = 0.0; // 명백한 스팸: 점수 없음
    issues.push('스팸 패턴 감지 - 점수 부여 안함');
  } else if (spamScore > 0.3) {
    qualityScore = 0.8; // 의심 스팸: 감점 (3.0 * 0.8 = 2.4점)
    issues.push('일부 스팸 패턴 감지');
  }

  // 4. 유효성 판단 (스팸이 아니면 유효)
  const isValid = spamScore <= 0.5;

  return {
    isValid,
    qualityScore,
    spamScore,
    issues,
    breakdown
  };
}

/**
 * 품질 보고서 생성 함수
 */
export function generateQualityReport(result: QuoteQualityResult): string {
  const report = [];
  
  report.push(`품질: ${(result.qualityScore * 100).toFixed(0)}%`);
  report.push(`스팸: ${(result.spamScore * 100).toFixed(0)}%`);
  
  if (result.issues.length > 0) {
    report.push(`이슈: ${result.issues.join(', ')}`);
  }
  
  if (result.breakdown.spamPatterns.length > 0) {
    report.push(`스팸 패턴: ${result.breakdown.spamPatterns.join(', ')}`);
  }
  
  return report.join(' | ');
}

/**
 * 상세 분석 결과 반환 함수
 */
export function getDetailedAnalysis(result: QuoteQualityResult) {
  return {
    summary: {
      valid: result.isValid,
      quality: result.qualityScore,
      spam: result.spamScore
    },
    breakdown: result.breakdown,
    issues: result.issues,
    recommendation: result.isValid ? 
      '인용이 승인되었습니다.' : 
      '인용이 거부되었습니다. 스팸 패턴이나 품질 기준을 확인해주세요.'
  };
}