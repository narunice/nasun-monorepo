/**
 * 한국어 텍스트 감지 유틸리티
 * 
 * 트윗 텍스트와 프로필 정보에서 한국어 컨텐츠를 감지하고
 * 신뢰도를 계산하는 기능을 제공합니다.
 */

import { LanguageCode, LanguageAnalysis } from '../types/community';

/**
 * 한국어 유니코드 범위
 * - 한글 음절: U+AC00-U+D7AF (가-힣)
 * - 한글 자모: U+1100-U+11FF, U+3130-U+318F
 * - 한글 호환 자모: U+3130-U+318F
 */
const KOREAN_UNICODE_RANGES = [
  [0xAC00, 0xD7AF], // 한글 음절 (가-힣)
  [0x1100, 0x11FF], // 한글 자모
  [0x3130, 0x318F], // 한글 호환 자모
] as const;

/**
 * 일반적인 한국어 단어 패턴
 */
const KOREAN_WORDS = [
  // 기본 인사말
  '안녕', '감사', '고마워', '미안', '죄송', '반가워',
  // 일상 표현
  '정말', '진짜', '완전', '너무', '좀', '많이', '조금',
  // 시간 표현
  '오늘', '어제', '내일', '지금', '나중', '이제',
  // 감정 표현
  '좋아', '싫어', '기뻐', '슬퍼', '화나', '놀라',
  // 의문사/대명사
  '뭐야', '왜', '어디', '언제', '누구', '어떻게',
  // 존댓말 어미
  '습니다', '입니다', '해요', '예요', '이에요',
] as const;

/**
 * 텍스트에서 한국어 문자 비율을 계산
 * @param text 분석할 텍스트
 * @returns 한국어 문자 비율 (0.0 ~ 1.0)
 */
export function calculateKoreanCharacterRatio(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }
  
  let koreanCharCount = 0;
  let totalCharCount = 0;
  
  for (const char of text) {
    const charCode = char.charCodeAt(0);
    
    // 공백, 특수문자, 숫자는 제외하고 계산
    if (char.match(/[a-zA-Z가-힣]/)) {
      totalCharCount++;
      
      // 한국어 유니코드 범위 확인
      if (isKoreanCharacter(charCode)) {
        koreanCharCount++;
      }
    }
  }
  
  return totalCharCount === 0 ? 0 : koreanCharCount / totalCharCount;
}

/**
 * 문자 코드가 한국어 범위에 속하는지 확인
 * @param charCode 문자 코드
 * @returns 한국어 문자 여부
 */
function isKoreanCharacter(charCode: number): boolean {
  return KOREAN_UNICODE_RANGES.some(([start, end]) => 
    charCode >= start && charCode <= end
  );
}

/**
 * 텍스트에 한국어 단어 패턴이 포함되어 있는지 확인
 * @param text 분석할 텍스트
 * @returns 한국어 단어 매칭 점수 (0.0 ~ 1.0)
 */
export function calculateKoreanWordScore(text: string): number {
  if (!text) {
    return 0;
  }
  
  const normalizedText = text.toLowerCase();
  let matchedWords = 0;
  
  for (const word of KOREAN_WORDS) {
    if (normalizedText.includes(word)) {
      matchedWords++;
    }
  }
  
  // 전체 단어 수 대비 매칭된 단어 비율로 점수 계산
  // 최대 50% 가중치로 제한 (너무 높지 않게)
  const wordScore = Math.min(matchedWords / KOREAN_WORDS.length, 0.5);
  return wordScore * 2; // 0~1 범위로 정규화
}

/**
 * Twitter ISO 639-1 언어 코드를 내부 LanguageCode로 매핑
 * @param twitterLang Twitter API lang 필드 (ISO 639-1)
 * @returns 내부 LanguageCode
 */
function mapTwitterLangToCode(twitterLang: string): LanguageCode {
  // ISO 639-1 표준 매핑
  const langMap: { [key: string]: LanguageCode } = {
    'ko': 'ko',           // 한국어
    'en': 'en',           // 영어
    'ja': 'ja',           // 일본어
    'zh': 'zh',           // 중국어 (일반)
    'zh-CN': 'zh',        // 중국어 간체
    'zh-TW': 'zh',        // 중국어 번체
  };

  return langMap[twitterLang] || 'unknown';
}

/**
 * 텍스트의 언어를 감지하고 신뢰도를 계산
 *
 * ✨ Twitter Engineering 표준 방법론 적용:
 * - Twitter API lang 필드를 주요 신뢰 소스로 사용
 * - 텍스트 분석은 폴백으로만 사용
 *
 * @param text 분석할 텍스트
 * @param twitterLang Twitter API에서 제공한 언어 정보 (ISO 639-1)
 * @returns 언어 감지 결과
 */
export function detectLanguage(
  text: string,
  twitterLang?: string
): { language: LanguageCode; confidence: number } {
  if (!text || text.trim().length === 0) {
    return { language: 'unknown', confidence: 0 };
  }

  // ✅ Phase 1: Twitter API lang 우선 신뢰 (표준 방법론)
  // Twitter의 자체 언어 감지 엔진은 매우 정확함 (>99% for major languages)
  if (twitterLang && twitterLang !== 'und') {
    const mappedLang = mapTwitterLangToCode(twitterLang);

    // ISO 639-1 표준 언어 코드면 높은 신뢰도로 반환
    if (mappedLang !== 'unknown') {
      return { language: mappedLang, confidence: 0.95 };
    }
  }

  // ✅ Phase 2: 'und' (undefined) 또는 lang 없는 경우 폴백
  // Twitter Engineering: "Choose 'und' if: emoticons, proper names, multilingual..."

  // 2-1. 간단한 한국어 문자 체크 (유니코드 범위)
  const koreanCharRatio = calculateKoreanCharacterRatio(text);
  if (koreanCharRatio >= 0.3) {
    return { language: 'ko', confidence: 0.7 };
  }

  // 2-2. 영문만 있는 경우
  if (text.match(/^[a-zA-Z\s.,!?]+$/)) {
    return { language: 'en', confidence: 0.6 };
  }

  // 2-3. 일본어 문자 체크 (히라가나/가타카나)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return { language: 'ja', confidence: 0.7 };
  }

  // 2-4. CJK 한자 (중국어 가능성)
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return { language: 'zh', confidence: 0.6 };
  }

  // Phase 3: 알 수 없음
  return { language: 'unknown', confidence: 0.3 };
}

/**
 * 여러 트윗의 언어 분석을 수행
 *
 * ✨ Twitter Engineering 표준 방법론:
 * - Twitter API lang 필드 빈도 기반 집계
 * - 가장 많은 언어를 주 언어로 결정
 * - Threshold 기반 멀티링구얼 처리
 *
 * @param tweets 트윗 배열 (text와 선택적 lang 속성 포함)
 * @returns 언어 분석 결과
 */
export function analyzeMultipleTweets(
  tweets: Array<{ text: string; lang?: string }>
): LanguageAnalysis {
  if (!tweets || tweets.length === 0) {
    return {
      koreanRatio: 0,
      totalTweets: 0,
      confidence: 0,
      languageDistribution: {
        ko: 0,
        en: 0,
        ja: 0,
        zh: 0,
        unknown: 0
      },
      dominantLanguage: 'unknown'
    };
  }

  // ✅ Phase 1: Twitter API lang 빈도 집계
  const langFrequency = new Map<string, number>();
  let undefinedCount = 0;

  for (const tweet of tweets) {
    const twitterLang = tweet.lang || 'und';

    // 'und' (undefined)는 별도 카운트
    if (twitterLang === 'und') {
      undefinedCount++;
      continue;
    }

    langFrequency.set(twitterLang, (langFrequency.get(twitterLang) || 0) + 1);
  }

  // ✅ Phase 2: 'und' 제외하고 정렬
  const validLangs = Array.from(langFrequency.entries())
    .sort((a, b) => b[1] - a[1]); // 빈도수 내림차순

  // ✅ Phase 3: 주 언어 결정
  const totalTweets = tweets.length;
  const validTweetCount = totalTweets - undefinedCount;

  let dominantLanguage: LanguageCode = 'unknown';
  let dominantCount = 0;
  let confidence = 0;

  // 언어 분포 초기화 (Phase 5에서 사용하지만 Phase 3.5에서도 업데이트 필요)
  const languageDistribution: { [key in LanguageCode]: number } = {
    ko: 0,
    en: 0,
    ja: 0,
    zh: 0,
    unknown: 0
  };

  if (validLangs.length > 0) {
    const [topLang, topCount] = validLangs[0];
    dominantLanguage = mapTwitterLangToCode(topLang);
    dominantCount = topCount;
    confidence = topCount / validTweetCount; // 유효 트윗 대비 비율
  }

  // ✅ Phase 3.5: Fallback when ALL tweets are 'und' - analyze text content
  // Twitter marks very short tweets, emoticons, URLs as 'und'
  if (dominantLanguage === 'unknown' && undefinedCount === totalTweets && totalTweets > 0) {
    console.log(
      `⚠️ [LANGUAGE_ANALYSIS] 모든 트윗이 'und' - 텍스트 분석 폴백 (${totalTweets}개 트윗)`
    );

    // Text-based language detection for 'und' tweets
    let koCount = 0;
    let enCount = 0;
    let jaCount = 0;
    let zhCount = 0;

    for (const tweet of tweets) {
      // Simple character-based detection (no twitterLang)
      const { language } = detectLanguage(tweet.text);

      switch (language) {
        case 'ko':
          koCount++;
          break;
        case 'en':
          enCount++;
          break;
        case 'ja':
          jaCount++;
          break;
        case 'zh':
          zhCount++;
          break;
      }
    }

    // Find dominant language from text analysis
    const textLangCounts = [
      { lang: 'ko' as LanguageCode, count: koCount },
      { lang: 'en' as LanguageCode, count: enCount },
      { lang: 'ja' as LanguageCode, count: jaCount },
      { lang: 'zh' as LanguageCode, count: zhCount }
    ].sort((a, b) => b.count - a.count);

    if (textLangCounts[0].count > 0) {
      dominantLanguage = textLangCounts[0].lang;
      dominantCount = textLangCounts[0].count;
      confidence = dominantCount / totalTweets;

      // Update language distribution based on text analysis
      for (const { lang, count } of textLangCounts) {
        if (count > 0) {
          languageDistribution[lang] = count / totalTweets;
        }
      }

      console.log(
        `✅ [LANGUAGE_ANALYSIS] 텍스트 분석 완료: ${dominantLanguage} (${(confidence * 100).toFixed(1)}%)`
      );
    }
  }

  // ✅ Phase 4: Threshold - 멀티링구얼 처리
  // Twitter Engineering: 주 언어가 50% 미만이면 멀티링구얼로 처리 가능
  const MULTILINGUAL_THRESHOLD = 0.50;

  if (validLangs.length > 1 && confidence < MULTILINGUAL_THRESHOLD) {
    console.log(
      `⚠️ [LANGUAGE_ANALYSIS] 멀티링구얼 감지: ` +
      `${dominantLanguage}=${(confidence * 100).toFixed(1)}% < ${MULTILINGUAL_THRESHOLD * 100}%`
    );
    // 현재는 그래도 주 언어 사용, 필요 시 'multi' 타입 추가 가능
  }

  // ✅ Phase 5: 언어 분포 계산 (정규화)
  // Note: languageDistribution already initialized in Phase 3

  // Only update from langFrequency if NOT using text fallback
  if (!(dominantLanguage !== 'unknown' && undefinedCount === totalTweets)) {
    for (const [lang, count] of langFrequency.entries()) {
      const mappedLang = mapTwitterLangToCode(lang);
      languageDistribution[mappedLang] += count / totalTweets;
    }

    // 'und' 트윗은 unknown으로 집계
    languageDistribution.unknown += undefinedCount / totalTweets;
  }
  // else: languageDistribution already updated by text fallback in Phase 3.5

  // 한국어 비율 계산 (하위 호환성)
  const koreanRatio = languageDistribution.ko;

  console.log(
    `📊 [LANGUAGE_ANALYSIS] ${totalTweets}개 트윗 분석 완료: ` +
    `주 언어=${dominantLanguage} (${(confidence * 100).toFixed(1)}%), ` +
    `유효=${validTweetCount}, und=${undefinedCount}`
  );

  return {
    koreanRatio,
    totalTweets,
    confidence,
    languageDistribution,
    dominantLanguage
  };
}

/**
 * 한국어 텍스트 신뢰도를 기반으로 최종 신뢰도 계산
 * @param languageAnalysis 언어 분석 결과
 * @param profileAnalysis 프로필 키워드 분석 결과 (선택사항)
 * @returns 최종 신뢰도 (0.0 ~ 1.0)
 */
export function calculateFinalConfidence(
  languageAnalysis: LanguageAnalysis,
  profileScore?: number
): number {
  let baseConfidence = languageAnalysis.confidence;
  
  // 트윗 수가 적은 경우 신뢰도 감소
  if (languageAnalysis.totalTweets < 5) {
    baseConfidence *= 0.8;
  } else if (languageAnalysis.totalTweets < 10) {
    baseConfidence *= 0.9;
  }
  
  // 한국어 비율이 높을수록 신뢰도 증가
  if (languageAnalysis.koreanRatio >= 0.8) {
    baseConfidence = Math.min(baseConfidence * 1.1, 1.0);
  } else if (languageAnalysis.koreanRatio >= 0.6) {
    baseConfidence = Math.min(baseConfidence * 1.05, 1.0);
  }
  
  // 프로필 분석 결과 반영 (최대 10% 가중치)
  if (profileScore !== undefined) {
    const profileBonus = profileScore * 0.1;
    baseConfidence = Math.min(baseConfidence + profileBonus, 1.0);
  }
  
  return Math.round(baseConfidence * 100) / 100; // 소수점 둘째자리
}

/**
 * 텍스트가 한국어인지 빠르게 확인 (간단한 휴리스틱)
 * @param text 확인할 텍스트
 * @returns 한국어 여부
 */
export function isKoreanText(text: string): boolean {
  if (!text || text.length < 2) {
    return false;
  }
  
  const koreanRatio = calculateKoreanCharacterRatio(text);
  return koreanRatio >= 0.3; // 30% 이상 한국어 문자가 포함된 경우
}

/**
 * 디버깅용 텍스트 분석 상세 정보
 * @param text 분석할 텍스트
 * @param twitterLang Twitter API 언어 정보
 * @returns 상세 분석 결과
 */
export function analyzeTextDetailed(text: string, twitterLang?: string) {
  const koreanCharRatio = calculateKoreanCharacterRatio(text);
  const koreanWordScore = calculateKoreanWordScore(text);
  const detection = detectLanguage(text, twitterLang);
  
  return {
    text: text.substring(0, 100), // 처음 100자만
    koreanCharRatio,
    koreanWordScore,
    twitterLang,
    detectedLanguage: detection.language,
    confidence: detection.confidence,
    isKorean: isKoreanText(text)
  };
}