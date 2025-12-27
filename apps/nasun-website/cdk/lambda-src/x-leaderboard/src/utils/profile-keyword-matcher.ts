/**
 * 프로필 키워드 매칭 유틸리티
 * 
 * 사용자 프로필 정보(bio, location, display name)에서 
 * 한국 관련 키워드를 찾아 분석하고 점수를 계산합니다.
 */

import { KeywordAnalysis, KOREAN_KEYWORDS } from '../types/community';

/**
 * 사용자 프로필 정보 인터페이스
 */
export interface UserProfile {
  description?: string;  // bio/자기소개
  location?: string;     // 위치 정보
  name?: string;         // 표시 이름
  username?: string;     // 사용자명
}

/**
 * 키워드 매칭 가중치 설정
 */
const KEYWORD_WEIGHTS = {
  location: 1.0,    // 지역 키워드 가중치
  culture: 0.8,     // 문화 키워드 가중치
  language: 0.9,    // 언어 키워드 가중치
  emoji: 0.7        // 이모지 가중치
} as const;

/**
 * 필드별 가중치 (어느 필드에서 발견되었는지에 따른 가중치)
 */
const FIELD_WEIGHTS = {
  location: 1.5,     // location 필드에서 발견된 경우 높은 가중치
  description: 1.0,  // bio/description 필드
  name: 0.8,         // display name 필드
  username: 0.6      // username 필드 (상대적으로 낮은 가중치)
} as const;

/**
 * 텍스트에서 한국 관련 키워드를 찾아 분석
 * @param text 분석할 텍스트
 * @param fieldType 텍스트가 속한 필드 타입
 * @returns 발견된 키워드와 점수
 */
function findKeywordsInText(
  text: string, 
  fieldType: keyof typeof FIELD_WEIGHTS
): { keywords: string[]; score: number; categoryMatches: KeywordAnalysis['categoryMatches'] } {
  if (!text) {
    return { 
      keywords: [], 
      score: 0, 
      categoryMatches: { location: [], culture: [], language: [], emoji: [] }
    };
  }
  
  const normalizedText = text.toLowerCase().trim();
  const foundKeywords: string[] = [];
  const categoryMatches: KeywordAnalysis['categoryMatches'] = {
    location: [],
    culture: [],
    language: [],
    emoji: []
  };
  
  let totalScore = 0;
  
  // 각 카테고리별 키워드 검사
  Object.entries(KOREAN_KEYWORDS).forEach(([category, keywords]) => {
    const categoryKey = category as keyof typeof KOREAN_KEYWORDS;
    const categoryWeight = KEYWORD_WEIGHTS[categoryKey];
    const fieldWeight = FIELD_WEIGHTS[fieldType];
    
    keywords.forEach(keyword => {
      if (normalizedText.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
        categoryMatches[categoryKey].push(keyword);
        
        // 점수 계산: 키워드 가중치 × 필드 가중치 × 키워드 길이 보너스
        const lengthBonus = Math.min(keyword.length / 10, 1.5); // 긴 키워드일수록 높은 점수
        const keywordScore = categoryWeight * fieldWeight * lengthBonus;
        totalScore += keywordScore;
      }
    });
  });
  
  return { keywords: foundKeywords, score: totalScore, categoryMatches };
}

/**
 * 사용자 프로필에서 한국 관련 키워드 분석
 * @param profile 사용자 프로필 정보
 * @returns 키워드 분석 결과
 */
export function analyzeProfileKeywords(profile: UserProfile): KeywordAnalysis {
  const allKeywords: string[] = [];
  const allCategoryMatches: KeywordAnalysis['categoryMatches'] = {
    location: [],
    culture: [],
    language: [],
    emoji: []
  };
  
  let totalScore = 0;
  let hasLocationMatch = false;
  
  // 각 필드별로 키워드 분석
  const fields: Array<{ text: string; type: keyof typeof FIELD_WEIGHTS }> = [
    { text: profile.location || '', type: 'location' },
    { text: profile.description || '', type: 'description' },
    { text: profile.name || '', type: 'name' },
    { text: profile.username || '', type: 'username' }
  ];
  
  fields.forEach(({ text, type }) => {
    if (text) {
      const analysis = findKeywordsInText(text, type);
      
      // 중복 키워드 제거하면서 합치기
      analysis.keywords.forEach(keyword => {
        if (!allKeywords.includes(keyword)) {
          allKeywords.push(keyword);
        }
      });
      
      // 카테고리 매칭 결과 합치기
      Object.entries(analysis.categoryMatches).forEach(([category, matches]) => {
        const categoryKey = category as keyof KeywordAnalysis['categoryMatches'];
        matches.forEach(match => {
          if (!allCategoryMatches[categoryKey].includes(match)) {
            allCategoryMatches[categoryKey].push(match);
          }
        });
      });
      
      totalScore += analysis.score;
      
      // 지역 매칭 확인
      if (type === 'location' && analysis.categoryMatches.location.length > 0) {
        hasLocationMatch = true;
      }
    }
  });
  
  // 점수 정규화 (0.0 ~ 1.0 범위)
  // 최대 예상 점수를 기준으로 정규화 (경험적으로 설정)
  const maxExpectedScore = 10.0;
  const normalizedScore = Math.min(totalScore / maxExpectedScore, 1.0);
  
  // 특별 보너스 적용
  let finalScore = normalizedScore;
  
  // 여러 카테고리에서 키워드가 발견된 경우 보너스
  const categoriesWithMatches = Object.values(allCategoryMatches)
    .filter(matches => matches.length > 0).length;
  
  if (categoriesWithMatches >= 3) {
    finalScore = Math.min(finalScore * 1.2, 1.0); // 20% 보너스
  } else if (categoriesWithMatches >= 2) {
    finalScore = Math.min(finalScore * 1.1, 1.0); // 10% 보너스
  }
  
  // 지역 정보에서 매칭된 경우 추가 보너스
  if (hasLocationMatch) {
    finalScore = Math.min(finalScore + 0.1, 1.0);
  }
  
  return {
    foundKeywords: allKeywords,
    score: Math.round(finalScore * 100) / 100, // 소수점 둘째자리
    hasLocationMatch,
    categoryMatches: allCategoryMatches
  };
}

/**
 * 특정 키워드가 한국 관련 키워드인지 확인
 * @param keyword 확인할 키워드
 * @returns 한국 관련 키워드 여부와 카테고리
 */
export function isKoreanKeyword(keyword: string): {
  isKorean: boolean;
  category?: keyof typeof KOREAN_KEYWORDS;
} {
  const normalizedKeyword = keyword.toLowerCase();
  
  for (const [category, keywords] of Object.entries(KOREAN_KEYWORDS)) {
    if (keywords.some(k => k.toLowerCase() === normalizedKeyword)) {
      return {
        isKorean: true,
        category: category as keyof typeof KOREAN_KEYWORDS
      };
    }
  }
  
  return { isKorean: false };
}

/**
 * 프로필 텍스트에서 잠재적 한국 관련 패턴 감지
 * @param text 분석할 텍스트
 * @returns 한국 관련 패턴 감지 결과
 */
export function detectKoreanPatterns(text: string): {
  hasKoreanCharacters: boolean;
  hasKoreanPatterns: boolean;
  confidence: number;
} {
  if (!text) {
    return { hasKoreanCharacters: false, hasKoreanPatterns: false, confidence: 0 };
  }
  
  // 한국어 문자 포함 여부
  const hasKoreanCharacters = /[가-힣]/.test(text);
  
  // 한국 관련 패턴 감지
  const koreanPatterns = [
    /kr\b/i,           // .kr, KR 등
    /seoul/i,          // Seoul
    /korea/i,          // Korea, Korean
    /한국/,             // 한국
    /🇰🇷/,             // 한국 국기 이모지
    /kpop|k-pop/i,     // K-pop
    /kdrama/i,         // K-drama
    /hangul/i,         // Hangul
  ];
  
  const hasKoreanPatterns = koreanPatterns.some(pattern => pattern.test(text));
  
  // 신뢰도 계산
  let confidence = 0;
  if (hasKoreanCharacters) confidence += 0.6;
  if (hasKoreanPatterns) confidence += 0.4;
  
  return {
    hasKoreanCharacters,
    hasKoreanPatterns,
    confidence: Math.min(confidence, 1.0)
  };
}

/**
 * 키워드 분석 결과를 바탕으로 최종 커뮤니티 타입 추천
 * @param keywordAnalysis 키워드 분석 결과
 * @param languageScore 언어 분석 점수 (선택사항)
 * @returns 커뮤니티 타입 추천과 신뢰도
 */
export function recommendCommunityType(
  keywordAnalysis: KeywordAnalysis,
  languageScore?: number
): {
  recommendedType: 'korean' | 'global';
  confidence: number;
  reasoning: string[];
} {
  const reasoning: string[] = [];
  let baseScore = keywordAnalysis.score;
  
  // 언어 점수가 있는 경우 결합 (60% 언어 + 40% 키워드)
  if (languageScore !== undefined) {
    baseScore = (languageScore * 0.6) + (keywordAnalysis.score * 0.4);
    reasoning.push(`언어 분석: ${languageScore.toFixed(2)}, 키워드 분석: ${keywordAnalysis.score.toFixed(2)}`);
  }
  
  // 지역 매칭 보너스
  if (keywordAnalysis.hasLocationMatch) {
    baseScore += 0.15;
    reasoning.push('프로필 위치에서 한국 관련 키워드 발견');
  }
  
  // 카테고리 다양성 보너스
  const categoriesCount = Object.values(keywordAnalysis.categoryMatches)
    .filter(matches => matches.length > 0).length;
  
  if (categoriesCount >= 2) {
    baseScore += 0.1;
    reasoning.push(`${categoriesCount}개 카테고리에서 키워드 발견`);
  }
  
  // 최종 결정
  const finalScore = Math.min(baseScore, 1.0);
  
  if (finalScore >= 0.7) {
    reasoning.push('높은 신뢰도로 한국 커뮤니티 분류');
    return { recommendedType: 'korean', confidence: finalScore, reasoning };
  } else if (finalScore >= 0.4) {
    reasoning.push('중간 신뢰도로 한국 커뮤니티 분류');
    return { recommendedType: 'korean', confidence: finalScore, reasoning };
  } else {
    reasoning.push('한국 관련 신호 부족으로 글로벌 커뮤니티 분류');
    return { recommendedType: 'global', confidence: 1.0 - finalScore, reasoning };
  }
}

/**
 * 디버깅용 프로필 분석 상세 정보
 * @param profile 사용자 프로필
 * @returns 상세 분석 결과
 */
export function analyzeProfileDetailed(profile: UserProfile) {
  const keywordAnalysis = analyzeProfileKeywords(profile);
  const patternAnalysis = {
    location: profile.location ? detectKoreanPatterns(profile.location) : null,
    description: profile.description ? detectKoreanPatterns(profile.description) : null,
    name: profile.name ? detectKoreanPatterns(profile.name) : null
  };
  
  return {
    profile: {
      location: profile.location,
      description: profile.description?.substring(0, 100), // 처음 100자만
      name: profile.name,
      username: profile.username
    },
    keywordAnalysis,
    patternAnalysis,
    recommendation: recommendCommunityType(keywordAnalysis)
  };
}