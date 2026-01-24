/**
 * 언어 코드 유틸리티 (ISO 639-1 기반 - 전체 언어 지원)
 * NASUN UI Design Guide 준수 - 모노톤 미니멀리즘 디자인
 */

// 모든 ISO 639-1 언어 코드 지원 (동적 타입)
export type LanguageCode = string;

// X API에서 사용하는 특수 비언어 코드
const SPECIAL_LANGUAGE_CODES = ['qht', 'qct', 'qam', 'qme', 'qst', 'zxx'];

// 주요 언어 코드 매핑 (ISO 639-1 표준)
export const LANGUAGE_FLAGS: Record<string, string> = {
  // 동아시아
  ko: 'ko',  // 한국어
  ja: 'ja',  // 일본어
  zh: 'zh',  // 중국어

  // 서구권
  en: 'en',  // 영어
  es: 'es',  // 스페인어
  fr: 'fr',  // 프랑스어
  de: 'de',  // 독일어
  it: 'it',  // 이탈리아어
  pt: 'pt',  // 포르투갈어
  nl: 'nl',  // 네덜란드어

  // 동유럽
  ru: 'ru',  // 러시아어
  pl: 'pl',  // 폴란드어
  uk: 'uk',  // 우크라이나어
  cs: 'cs',  // 체코어

  // 중동/아프리카
  ar: 'ar',  // 아랍어
  he: 'he',  // 히브리어
  tr: 'tr',  // 터키어
  fa: 'fa',  // 페르시아어

  // 동남아시아
  th: 'th',  // 태국어
  vi: 'vi',  // 베트남어
  id: 'id',  // 인도네시아어
  ms: 'ms',  // 말레이어
  tl: 'tl',  // 타갈로그어 (필리핀)

  // 남아시아
  hi: 'hi',  // 힌디어
  bn: 'bn',  // 벵골어

  // 북유럽
  sv: 'sv',  // 스웨덴어
  no: 'no',  // 노르웨이어
  da: 'da',  // 덴마크어
  fi: 'fi',  // 핀란드어

  // 기타
  unknown: 'unknown'  // 미확인
} as const;

// 언어별 이름 매핑 (다국어 지원)
export const LANGUAGE_NAMES: Record<string, { ko: string; en: string }> = {
  // 동아시아
  ko: { ko: '한국어', en: 'Korean' },
  ja: { ko: '일본어', en: 'Japanese' },
  zh: { ko: '중국어', en: 'Chinese' },

  // 서구권
  en: { ko: '영어', en: 'English' },
  es: { ko: '스페인어', en: 'Spanish' },
  fr: { ko: '프랑스어', en: 'French' },
  de: { ko: '독일어', en: 'German' },
  it: { ko: '이탈리아어', en: 'Italian' },
  pt: { ko: '포르투갈어', en: 'Portuguese' },
  nl: { ko: '네덜란드어', en: 'Dutch' },

  // 동유럽
  ru: { ko: '러시아어', en: 'Russian' },
  pl: { ko: '폴란드어', en: 'Polish' },
  uk: { ko: '우크라이나어', en: 'Ukrainian' },
  cs: { ko: '체코어', en: 'Czech' },

  // 중동/아프리카
  ar: { ko: '아랍어', en: 'Arabic' },
  he: { ko: '히브리어', en: 'Hebrew' },
  tr: { ko: '터키어', en: 'Turkish' },
  fa: { ko: '페르시아어', en: 'Persian' },

  // 동남아시아
  th: { ko: '태국어', en: 'Thai' },
  vi: { ko: '베트남어', en: 'Vietnamese' },
  id: { ko: '인도네시아어', en: 'Indonesian' },
  ms: { ko: '말레이어', en: 'Malay' },
  tl: { ko: '타갈로그어', en: 'Tagalog' },

  // 남아시아
  hi: { ko: '힌디어', en: 'Hindi' },
  bn: { ko: '벵골어', en: 'Bengali' },

  // 북유럽
  sv: { ko: '스웨덴어', en: 'Swedish' },
  no: { ko: '노르웨이어', en: 'Norwegian' },
  da: { ko: '덴마크어', en: 'Danish' },
  fi: { ko: '핀란드어', en: 'Finnish' },

  // 기타
  unknown: { ko: '기타', en: 'Unknown' }
} as const;

// 언어별 색상 테마 (다크 모드 기본 - 모노크롬 색상 팔레트)
export const LANGUAGE_COLORS = {
  ko: {
    primary: 'white', // 한국어만 특별 강조
    background: 'gray-800',
    text: 'white'
  },
  default: {
    primary: 'gray-400', // 나머지 모든 언어 동일
    background: 'gray-900',
    text: 'gray-400'
  },
  unknown: {
    primary: 'gray-600', // 기타 - 회색 톤
    background: 'gray-900',
    text: 'gray-600'
  }
} as const;

/**
 * 언어 코드 가져오기
 * @param languageCode 언어 코드 (ISO 639-1)
 * @returns 언어 코드 문자열
 */
export function getLanguageFlag(languageCode?: string): string {
  if (!languageCode) return LANGUAGE_FLAGS.unknown;

  const code = languageCode.toLowerCase();

  // 특수 코드 처리
  if (SPECIAL_LANGUAGE_CODES.includes(code)) {
    return LANGUAGE_FLAGS.unknown;
  }

  // 정확한 매핑이 있으면 사용
  if (LANGUAGE_FLAGS[code]) {
    return LANGUAGE_FLAGS[code];
  }

  // 매핑 없는 언어는 코드를 소문자로 반환
  return code;
}

/**
 * 언어 코드에서 이름 가져오기
 * @param languageCode 언어 코드 (ISO 639-1)
 * @param locale 로케일 (ko | en)
 * @returns 언어 이름 또는 코드
 */
export function getLanguageName(languageCode?: string, locale: 'ko' | 'en' = 'ko'): string {
  if (!languageCode) return LANGUAGE_NAMES.unknown[locale];

  const code = languageCode.toLowerCase();

  // 특수 코드 처리
  if (SPECIAL_LANGUAGE_CODES.includes(code)) {
    return LANGUAGE_NAMES.unknown[locale];
  }

  // 정확한 매핑이 있으면 사용
  if (LANGUAGE_NAMES[code]) {
    return LANGUAGE_NAMES[code][locale];
  }

  // 매핑 없는 언어는 코드를 반환 (예: "sv" → "SV")
  return code.toUpperCase();
}

/**
 * 언어 코드에서 색상 테마 가져오기 (단순화)
 * @param languageCode 언어 코드 (ISO 639-1)
 * @returns 색상 테마
 */
export function getLanguageColors(languageCode?: string) {
  if (!languageCode) return LANGUAGE_COLORS.unknown;

  const code = languageCode.toLowerCase();

  // 특수 코드 처리
  if (SPECIAL_LANGUAGE_CODES.includes(code)) {
    return LANGUAGE_COLORS.unknown;
  }

  // 한국어만 특별 강조
  if (code === 'ko') return LANGUAGE_COLORS.ko;

  // unknown 처리
  if (code === 'unknown') return LANGUAGE_COLORS.unknown;

  // 나머지 모든 언어는 동일한 색상
  return LANGUAGE_COLORS.default;
}

/**
 * 언어 코드가 유효한지 확인
 * @param languageCode 언어 코드
 * @returns 유효한 코드인지 여부
 */
export function isValidLanguageCode(languageCode?: string): languageCode is LanguageCode {
  if (!languageCode) return false;
  // ISO 639-1 표준: 2글자 또는 3글자 소문자
  return /^[a-z]{2,3}$/i.test(languageCode);
}

/**
 * 모든 지원되는 언어 코드 목록 가져오기
 * @returns 언어 코드 배열 (매핑된 주요 언어만)
 */
export function getAllLanguageCodes(): string[] {
  return Object.keys(LANGUAGE_FLAGS).filter(code => code !== 'unknown');
}