/**
 * WordPress content.rendered 데이터 정제 유틸리티
 *
 * WordPress API가 반환하는 content.rendered 필드가 다음과 같은 문제를 포함할 수 있음:
 * 1. 유니코드 이스케이프 인코딩 (\u003Cp\u003E → <p>)
 * 2. <pre class="wp-block-preformatted"> 태그로 래핑
 * 3. 이중 직렬화 ("rendered": "..." 형태의 중첩)
 *
 * @see https://cms.moonoak.io/wp-json/wp/v2/posts
 */

/**
 * WordPress content.rendered 필드를 정제하여 순수 HTML로 변환
 *
 * @param rawContent - WordPress API에서 받은 content.rendered 값
 * @returns 정제된 HTML 문자열
 */
export function sanitizeWordPressContent(rawContent: string): string {
  if (!rawContent || typeof rawContent !== 'string') {
    return '';
  }

  let content = rawContent;

  // 1. <pre> 블록 내부 콘텐츠 추출
  // WordPress가 콘텐츠를 <pre class="wp-block-preformatted"> 태그로 감싸는 경우
  const preMatch = content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch) {
    content = preMatch[1]; // pre 태그 내부만 추출
  }

  // 2. 유니코드 이스케이프 시퀀스 디코딩
  // \u003C → <, \u003E → >, \/ → /
  if (content.includes('\\u003C') || content.includes('\\u003E') || content.includes('\\u')) {
    try {
      // JSON.parse를 이용한 안전한 디코딩
      // 이미 있는 따옴표를 이스케이프하고 전체를 JSON 문자열로 감싸서 파싱
      const escaped = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      content = JSON.parse(`"${escaped}"`);
    } catch {
      // JSON 파싱 실패 시 수동 변환 (fallback)
      content = content
        .replace(/\\u003C/gi, '<')
        .replace(/\\u003E/gi, '>')
        .replace(/\\u0022/gi, '"')
        .replace(/\\u0027/gi, "'")
        .replace(/\\u0026/gi, '&')
        .replace(/\\\//g, '/')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '\t');
    }
  }

  // 3. "rendered": "..." 패턴 추출 (이중 직렬화 해제)
  // WordPress가 JSON 전체를 문자열로 직렬화하는 경우
  const renderedMatch = content.match(/"rendered"\s*:\s*"([\s\S]*?)(?<!\\)"/);
  if (renderedMatch) {
    try {
      // 추출된 값을 다시 JSON 문자열로 파싱
      content = JSON.parse(`"${renderedMatch[1]}"`);
    } catch {
      content = renderedMatch[1];
    }
  }

  // 4. WordPress 블록 주석 제거 (Gutenberg 에디터 주석)
  // <!-- wp:paragraph --> 또는 <!-- /wp:paragraph --> 형태
  content = content.replace(/<!--\s*\/?wp:[^>]+-->/g, '');

  // 5. 불필요한 이스케이프 백슬래시 제거
  content = content.replace(/\\\\/g, '\\');

  // 6. 앞뒤 공백 및 빈 줄 정리
  content = content.trim();

  return content;
}

/**
 * HTML 태그를 제거하고 순수 텍스트만 추출
 * (기존 AwardsGrantsSection의 stripHtml 함수와 동일한 기능)
 *
 * @param html - HTML 문자열
 * @returns 태그가 제거된 순수 텍스트
 */
export function stripHtmlTags(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  return decodeHtmlEntities(html.replace(/<[^>]*>?/gm, ''));
}

/**
 * WordPress가 반환하는 HTML 엔티티(&#8211; &#8217; &amp; 등)를 실제 문자로 디코딩
 *
 * @param text - HTML 엔티티를 포함한 문자열
 * @returns 디코딩된 문자열
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
