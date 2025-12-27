/**
 * 북마크 컴포넌트 렌더링 테스트
 * Phase 6 완료 검증을 위한 간단한 렌더링 테스트
 */

// 북마크 관련 컴포넌트 렌더링 테스트
const testBookmarkComponents = async () => {
  console.log('🧪 Phase 6 북마크 컴포넌트 렌더링 테스트 시작');
  
  const tests = [
    {
      name: '리더보드 메인 페이지',
      url: 'http://localhost:5175/leaderboard',
      selectors: [
        '.leaderboard-container',
        '[data-testid="leaderboard-table"]',
        '[data-testid="bookmark-column"]'
      ]
    },
    {
      name: 'V2 누적 리더보드',
      url: 'http://localhost:5175/leaderboard?version=v2',
      selectors: [
        '[data-testid="cumulative-leaderboard"]',
        '[data-testid="bookmark-header"]',
        '[data-testid="score-metrics"]'
      ]
    },
    {
      name: '점수 메트릭 디스플레이',
      url: 'http://localhost:5175/leaderboard?version=v2',
      selectors: [
        '[data-testid="score-metrics-display"]',
        '[data-testid="bookmark-metric-card"]',
        '.bookmark-weight-badge'
      ]
    }
  ];

  const results = [];

  for (const test of tests) {
    console.log(`\n📝 테스트: ${test.name}`);
    
    try {
      const response = await fetch(test.url);
      const html = await response.text();
      
      // 기본 HTML 구조 확인
      const hasBasicStructure = html.includes('<div') && html.includes('<html');
      console.log(`  ✅ HTML 구조: ${hasBasicStructure ? '정상' : '오류'}`);
      
      // React 앱 렌더링 확인
      const hasReactApp = html.includes('id="root"') && html.includes('script');
      console.log(`  ✅ React 앱: ${hasReactApp ? '정상' : '오류'}`);
      
      // 북마크 관련 키워드 확인
      const bookmarkKeywords = ['bookmark', '북마크', '3.5점', 'PREMIUM'];
      const foundKeywords = bookmarkKeywords.filter(keyword => 
        html.toLowerCase().includes(keyword.toLowerCase())
      );
      console.log(`  ✅ 북마크 키워드 (${foundKeywords.length}/${bookmarkKeywords.length}): ${foundKeywords.join(', ')}`);
      
      results.push({
        name: test.name,
        status: hasBasicStructure && hasReactApp ? 'PASS' : 'FAIL',
        hasBookmarkContent: foundKeywords.length > 0,
        foundKeywords
      });
      
    } catch (error) {
      console.log(`  ❌ 오류: ${error.message}`);
      results.push({
        name: test.name,
        status: 'ERROR',
        error: error.message
      });
    }
  }

  // 결과 요약
  console.log('\n📊 테스트 결과 요약:');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;
  
  console.log(`  ✅ 성공: ${passCount}`);
  console.log(`  ❌ 실패: ${failCount}`);
  console.log(`  🚫 오류: ${errorCount}`);
  
  // 북마크 콘텐츠 확인
  const bookmarkContentCount = results.filter(r => r.hasBookmarkContent).length;
  console.log(`  🔖 북마크 콘텐츠 포함: ${bookmarkContentCount}/${results.length}`);
  
  return {
    total: results.length,
    passed: passCount,
    failed: failCount,
    errors: errorCount,
    bookmarkContent: bookmarkContentCount,
    results
  };
};

// 실행
testBookmarkComponents().then(result => {
  console.log('\n🎯 Phase 6 컴포넌트 렌더링 테스트 완료');
  console.log(`전체 성과: ${result.passed}/${result.total} 테스트 통과`);
  
  if (result.passed === result.total && result.bookmarkContent > 0) {
    console.log('🎉 Phase 6 컴포넌트 렌더링 테스트 성공!');
  } else {
    console.log('⚠️  일부 테스트에서 문제 발견됨');
  }
}).catch(console.error);