/**
 * CloudWatch 대시보드 설정 실행 스크립트
 * 
 * 리더보드 모니터링 대시보드를 로컬에서 설정할 수 있습니다.
 */

// 환경 변수 설정
process.env.AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';

import { CloudWatchDashboardManager } from './src/services/cloudwatch-dashboard-manager';

/**
 * 메인 실행 함수
 */
async function setupDashboards(): Promise<void> {
  console.log('🚀 CloudWatch 대시보드 설정 시작\n');
  
  try {
    // 명령줄 인수 파싱
    const args = process.argv.slice(2);
    const action = args[0] as 'create-all' | 'create' | 'list' | 'delete' | 'health' | 'help' || 'create-all';
    const dashboardName = args[1];
    
    console.log(`📋 실행 액션: ${action.toUpperCase()}`);
    if (dashboardName) console.log(`🎯 대상 대시보드: ${dashboardName}`);
    
    const dashboardManager = new CloudWatchDashboardManager();
    
    switch (action) {
      case 'create-all':
        console.log('📊 모든 모니터링 대시보드 생성...');
        await dashboardManager.createAllDashboards();
        break;
        
      case 'create':
        if (!dashboardName) {
          console.error('❌ 생성할 대시보드 이름을 지정해주세요');
          console.log('사용법: pnpm run setup:dashboard:[leaderboard|quality|performance]');
          process.exit(1);
        }
        
        console.log(`📊 대시보드 '${dashboardName}' 생성 중...`);
        switch (dashboardName) {
          case 'leaderboard':
            await dashboardManager.createLeaderboardDashboard();
            break;
          case 'quality':
            await dashboardManager.createDataQualityDashboard();
            break;
          case 'performance':
            await dashboardManager.createPerformanceDashboard();
            break;
          default:
            console.error(`❌ 알 수 없는 대시보드 타입: ${dashboardName}`);
            console.log('사용 가능한 타입: leaderboard, quality, performance');
            process.exit(1);
        }
        break;
        
      case 'list':
        console.log('📋 생성된 대시보드 목록 조회...');
        await dashboardManager.listDashboards();
        break;
        
      case 'delete':
        if (!dashboardName) {
          console.error('❌ 삭제할 대시보드 이름을 지정해주세요');
          console.log('사용법: tsx dashboard-setup.ts delete [dashboard-name]');
          process.exit(1);
        }
        
        console.log(`🗑️ 대시보드 '${dashboardName}' 삭제 중...`);
        await dashboardManager.deleteDashboard(dashboardName);
        break;
        
      case 'health':
        console.log('🏥 대시보드 상태 확인...');
        await dashboardManager.checkDashboardHealth();
        break;
        
      case 'help':
        printHelp();
        process.exit(0);
        
      default:
        console.error(`❌ 알 수 없는 액션: ${action}`);
        printHelp();
        process.exit(1);
    }
    
    console.log('\n🎉 대시보드 설정 완료!');
    
    // 설정 완료 후 가이드 제공
    if (action === 'create-all' || action === 'create') {
      const region = process.env.AWS_REGION || 'ap-northeast-2';
      console.log('\n📊 생성된 대시보드 접속 방법:');
      console.log(`🔗 CloudWatch Console: https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:`);
      console.log('\n💡 다음 단계:');
      console.log('   1. CloudWatch Console에서 대시보드 확인');
      console.log('   2. 알림 규칙 설정 (필요시)');
      console.log('   3. 정기적인 모니터링 체크 일정 수립');
      console.log('   4. 팀원들과 대시보드 URL 공유');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 대시보드 설정 실패:', error);
    
    if (error instanceof Error) {
      console.error('오류 상세:', error.message);
      
      // 일반적인 오류 해결 가이드
      console.log('\n🔧 문제 해결 가이드:');
      
      if (error.message.includes('credentials')) {
        console.log('   ❌ AWS 자격 증명 오류');
        console.log('      1. AWS CLI 설정 확인: aws configure');
        console.log('      2. IAM 권한 확인 (CloudWatch 대시보드 생성 권한 필요)');
        console.log('      3. 환경 변수 AWS_REGION 설정 확인');
      } else if (error.message.includes('region')) {
        console.log('   ❌ AWS 리전 설정 오류');
        console.log('      1. 환경 변수 AWS_REGION 설정 확인');
        console.log('      2. AWS CLI 기본 리전 설정 확인');
      } else if (error.message.includes('permission')) {
        console.log('   ❌ 권한 부족 오류');
        console.log('      1. CloudWatch 대시보드 생성 권한 확인');
        console.log('      2. IAM 정책에 다음 권한 추가:');
        console.log('         - cloudwatch:PutDashboard');
        console.log('         - cloudwatch:GetDashboard');
        console.log('         - cloudwatch:ListDashboards');
        console.log('         - cloudwatch:DeleteDashboards');
      } else {
        console.log('   1. AWS 연결 상태 확인');
        console.log('   2. CloudWatch 서비스 가용성 확인');
        console.log('   3. 네트워크 연결 상태 확인');
        console.log('   4. AWS 서비스 한도 확인');
      }
    }
    
    process.exit(1);
  }
}

/**
 * 도움말 출력
 */
function printHelp(): void {
  console.log('📖 CloudWatch 대시보드 설정 사용법\n');
  console.log('사용법: pnpm run setup:dashboard:[option] 또는 tsx dashboard-setup.ts [action] [options]\n');
  console.log('액션:');
  console.log('  create-all    - 모든 모니터링 대시보드 생성 [기본값]');
  console.log('  create        - 특정 대시보드 생성');
  console.log('  list          - 생성된 대시보드 목록 조회');
  console.log('  delete        - 특정 대시보드 삭제');
  console.log('  health        - 대시보드 상태 확인');
  console.log('  help          - 이 도움말 출력');
  console.log('\n대시보드 타입 (create 액션용):');
  console.log('  leaderboard   - 통합 모니터링 대시보드');
  console.log('  quality       - 데이터 품질 전용 대시보드');
  console.log('  performance   - 성능 모니터링 전용 대시보드');
  console.log('\n예시:');
  console.log('  pnpm run setup:dashboard                    # 모든 대시보드 생성');
  console.log('  pnpm run setup:dashboard:all               # 모든 대시보드 생성');
  console.log('  pnpm run setup:dashboard:leaderboard       # 통합 대시보드만 생성');
  console.log('  pnpm run setup:dashboard:quality           # 품질 대시보드만 생성');
  console.log('  pnpm run list:dashboard                    # 대시보드 목록 조회');
  console.log('  pnpm run check:dashboard                   # 상태 확인');
  console.log('  tsx dashboard-setup.ts delete NASUN-Leaderboard-Monitoring-v2  # 특정 대시보드 삭제');
  console.log('\n📊 생성되는 대시보드:');
  console.log('  • NASUN-Leaderboard-Monitoring-v2   : 통합 모니터링 (시스템 상태, 성능, 에러)');
  console.log('  • NASUN-Data-Quality-Dashboard-v2    : 데이터 품질 (검증 규칙, 완성도, 일관성)');
  console.log('  • NASUN-Performance-Dashboard-v2     : 성능 최적화 (Lambda, DynamoDB, 비용)');
  console.log('\n⚠️ 요구사항:');
  console.log('  • AWS CLI 설정 필요');
  console.log('  • CloudWatch 대시보드 생성 권한 필요');
  console.log('  • 인터넷 연결 필요');
}

/**
 * 사전 요구사항 확인
 */
async function checkPrerequisites(): Promise<void> {
  console.log('🔍 사전 요구사항 확인 중...');
  
  // AWS 리전 확인
  const region = process.env.AWS_REGION;
  if (!region) {
    console.warn('⚠️ AWS_REGION 환경 변수가 설정되지 않았습니다. 기본값 ap-northeast-2 사용');
  } else {
    console.log(`✅ AWS 리전: ${region}`);
  }
  
  // 기본 권한 확인 (실제로는 더 정교한 검사 필요)
  console.log('✅ 사전 요구사항 확인 완료');
}

// 도움말 요청 확인
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

// 메인 실행
if (require.main === module) {
  checkPrerequisites()
    .then(() => setupDashboards())
    .catch(error => {
      console.error('💥 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

export { setupDashboards };