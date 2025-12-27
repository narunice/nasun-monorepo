const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

// 빌드 설정
const buildConfig = {
  entryPoints: [
    // 점수 계산 및 리더보드 생성
    'src/handlers/batch/cumulative-score-calculator.ts',
    'src/handlers/batch/cumulative-leaderboard-generator.ts',
    'src/handlers/batch/profile-enhancement-scheduler.ts',
    'src/handlers/batch/community-classifier-batch.ts',

    // API 핸들러들
    'src/handlers/api/get-cumulative-leaderboard.ts',
    'src/handlers/api/excluded-accounts-status.ts',
    'src/handlers/api/get-leaderboard-snapshot.ts',
    'src/handlers/api/get-user-rank.ts',
    'src/handlers/api/search-users.ts',
    'src/handlers/api/get-autocomplete.ts',
    'src/handlers/api/get-rank-changes.ts',
    'src/handlers/api/get-user-rank-history.ts',
    'src/handlers/api/get-top-climbers.ts',
    'src/handlers/api/get-leaderboard-config.ts',

    // Step Functions 파이프라인 핸들러들
    'src/handlers/batch/get-target-tweets.ts',
    'src/handlers/batch/aggregate-results.ts',
    'src/handlers/batch/handle-failure.ts',
    'src/handlers/batch/collect-mentions.ts',
    'src/handlers/batch/collect-mentions-search.ts',
    'src/handlers/batch/collect-mention-details.ts',

    // 데이터 수집 핸들러들
    'src/handlers/batch/tweet-batch-splitter.ts',
    'src/handlers/batch/collect-likes.ts',
    'src/handlers/batch/collect-retweets.ts',
    'src/handlers/batch/collect-quotes.ts',
    'src/handlers/batch/collect-high-engagement-replies.ts',

    // 시스템 핸들러들 (OAuth 토큰 관리)
    'src/handlers/system/refresh-oauth2-token.ts',

    // 테스트/유틸리티 함수들
    'src/handlers/test/load-test-runner.ts',
    'src/handlers/test/mock-data-generator.ts',
    'src/handlers/test/mention-scoring-test.ts',
    'src/handlers/test/mention-verification.ts',
    'src/handlers/monitoring/anomaly-detection-handler.ts',
    'src/handlers/monitoring/dashboard-setup-handler.ts',
    'src/handlers/monitoring/data-quality-dashboard.ts'
  ],
  bundle: true,
  minify: isProduction,
  sourcemap: !isProduction,
  target: 'node18',
  platform: 'node',
  outdir: 'dist',
  format: 'cjs',
  external: [
    'aws-sdk',        // Lambda Runtime 포함 (Legacy)
    '@aws-sdk/*',     // Lambda Runtime 포함 (v3)
    '@aws/*'          // AWS 내부 패키지 모두 제외 (lambda-invoke-store 등)
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
};

async function build() {
  console.log('🚀 x-leaderboard 빌드 시작...');
  
  try {
    // dist 디렉토리 정리
    if (fs.existsSync('dist')) {
      fs.rmSync('dist', { recursive: true, force: true });
    }
    fs.mkdirSync('dist', { recursive: true });
    
    console.log('📦 TypeScript 컴파일 및 번들링...');
    const result = await esbuild.build(buildConfig);
    
    if (result.warnings.length > 0) {
      console.warn('⚠️ 빌드 경고:', result.warnings);
    }
    
    console.log('✅ x-leaderboard 빌드 완료!');
    console.log(`📊 빌드 결과:`);
    
    // 빌드된 파일들 확인
    const distFiles = fs.readdirSync('dist');
    distFiles.forEach(file => {
      const filePath = path.join('dist', file);
      const stats = fs.statSync(filePath);
      const sizeKB = Math.round(stats.size / 1024);
      console.log(`   📄 ${file}: ${sizeKB} KB`);
    });
    
    console.log(`✨ 총 ${distFiles.length}개 핸들러 빌드 완료`);
    
  } catch (error) {
    console.error('❌ 빌드 실패:', error);
    process.exit(1);
  }
}

// 메인 실행
if (require.main === module) {
  build();
}

module.exports = { build, buildConfig };