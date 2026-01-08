#!/usr/bin/env node
/**
 * CDK 배포 후 API 엔드포인트를 프론트엔드 .env 파일에 자동 동기화
 *
 * 사용법:
 *   node scripts/sync-api-endpoints.js [environment] [--dry-run]
 *   예: node scripts/sync-api-endpoints.js development
 *   예: node scripts/sync-api-endpoints.js production --dry-run
 */

const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');
const fs = require('fs');
const path = require('path');

// AWS 설정
const REGION = 'ap-northeast-2';
const client = new CloudFormationClient({ region: REGION });

// CDK 스택 이름들
const STACKS = ['CommonStack', 'AuthStack', 'CdkStack'];

// CloudFormation Output Key -> .env 변수명 매핑
const MAPPING = {
  // CommonStack
  'JoinWhitelistApiUrl': 'VITE_JOIN_WHITELIST_API',
  'WithdrawWhitelistApiUrl': 'VITE_WITHDRAW_WHITELIST_API',
  'CheckWhitelistApiUrl': 'VITE_CHECK_WHITELIST_API',
  'DeactivateAccountApiUrl': 'VITE_DEACTIVATE_USER_API_URL',
  'UserProfileApiUrl': 'VITE_USER_PROFILE_API',
  'RandomImageApiUrl': 'VITE_RANDOM_IMAGE_API_ENDPOINT',
  'PriceApiUrl': 'VITE_PRICE_API_ENDPOINT',
  'GetSupplyCountApiUrl': 'VITE_SUPPLY_COUNT_API_ENDPOINT',
  'GetAllSupplyCountsApiUrl': 'VITE_ALL_SUPPLY_COUNTS_API_ENDPOINT',
  'GetBackupPricesApiUrl': 'VITE_BACKUP_API_ENDPOINT',
  'LinkAccountApiUrl': 'VITE_LINK_ACCOUNT_API',
  'GetAwsCredentialsApiUrl': 'VITE_AWS_CREDENTIALS_API',
  'WalletApiUrl': 'VITE_WALLET_API_ENDPOINT',
  'GetUserCountApiUrl': 'VITE_USER_COUNT_API',
  'GetFollowerCountApiUrl': 'VITE_FOLLOWER_COUNT_API',

  // AuthStack (특수 처리: path 추가 필요)
  'TwitterAuthApiUrl': {
    envVar: 'VITE_TWITTER_AUTH_API',
    appendPath: 'auth/twitter'
  },
  'MetaMaskAuthApiUrl': {
    envVar: 'VITE_METAMASK_AUTH_API',
    appendPath: 'auth/metamask'
  },

  // CdkStack (특수 처리: /api path 추가)
  'ApiEndpoint': {
    envVar: 'VITE_X_LEADERBOARD_V2_API_ENDPOINT',
    appendPath: 'api'
  }
};

// 프론트엔드 .env 파일 경로
const FRONTEND_DIR = path.resolve(__dirname, '../../frontend');

// 명령줄 인수 파싱
const args = process.argv.slice(2);
let targetEnvironment = null;
let isDryRun = false;

if (args.length > 0) {
  if (args[0] === 'development' || args[0] === 'production' || args[0] === 'staging') {
    targetEnvironment = args[0];
    if (args.length > 1 && args[1] === '--dry-run') {
      isDryRun = true;
    }
  } else if (args[0] === '--dry-run') {
    isDryRun = true;
  }
}

const ENV_FILES_TO_UPDATE = targetEnvironment ? [`.env.${targetEnvironment}`] : [
  '.env.development',
  '.env.production',
  '.env.staging'
];

/**
 * CloudFormation 스택의 Outputs 가져오기
 */
async function getStackOutputs(stackName) {
  try {
    const command = new DescribeStacksCommand({ StackName: stackName });
    const response = await client.send(command);

    if (!response.Stacks || response.Stacks.length === 0) {
      console.warn(`⚠️  스택 '${stackName}'을(를) 찾을 수 없습니다.`);
      return {};
    }

    const outputs = {};
    (response.Stacks[0].Outputs || []).forEach(output => {
      outputs[output.OutputKey] = output.OutputValue;
    });

    return outputs;
  } catch (error) {
    console.error(`❌ 스택 '${stackName}' Outputs 가져오기 실패:`, error.message);
    return {};
  }
}

/**
 * 모든 스택의 Outputs 수집
 */
async function collectAllOutputs() {
  console.log('📡 CloudFormation Outputs 수집 중...\n');

  const allOutputs = {};

  for (const stackName of STACKS) {
    console.log(`   - ${stackName} 조회 중...`);
    const outputs = await getStackOutputs(stackName);
    Object.assign(allOutputs, outputs);
  }

  console.log(`\n✅ 총 ${Object.keys(allOutputs).length}개 Outputs 수집 완료\n`);
  return allOutputs;
}

/**
 * .env 파일 파싱
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  파일이 없습니다: ${filePath}`);
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const env = {};

  lines.forEach((line, index) => {
    // 주석과 빈 줄 건너뛰기
    if (line.trim().startsWith('#') || line.trim() === '') {
      env[index] = line; // 원본 유지
      return;
    }

    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      env[key] = value;
    } else {
      env[index] = line; // 파싱 불가능한 줄은 원본 유지
    }
  });

  return env;
}

/**
 * .env 파일에 변경사항 적용
 */
function updateEnvFile(filePath, updates) {
  const env = parseEnvFile(filePath);
  let changeCount = 0;

  Object.entries(updates).forEach(([key, newValue]) => {
    if (env[key] !== newValue) {
      console.log(`   ${key}`);
      console.log(`     Before: ${env[key] || '(없음)'}`);
      console.log(`     After:  ${newValue}`);
      env[key] = newValue;
      changeCount++;
    }
  });

  if (changeCount === 0) {
    console.log(`   ℹ️  변경사항 없음`);
    return false;
  }

  if (isDryRun) {
    console.log(`   🔍 [DRY-RUN] ${changeCount}개 변경사항 (실제 적용 안 함)`);
    return false;
  }

  // .env 파일 재구성
  const lines = [];
  Object.entries(env).forEach(([key, value]) => {
    if (typeof key === 'string' && isNaN(key)) {
      // 환경 변수
      lines.push(`${key}=${value}`);
    } else {
      // 주석 또는 빈 줄
      lines.push(value);
    }
  });

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  console.log(`   ✅ ${changeCount}개 변경사항 저장됨`);
  return true;
}

/**
 * CloudFormation Outputs를 .env 업데이트 맵으로 변환
 */
function buildUpdatesMap(outputs) {
  const updates = {};

  Object.entries(MAPPING).forEach(([cfKey, mapping]) => {
    const outputValue = outputs[cfKey];
    if (!outputValue) {
      return; // Output이 없으면 건너뛰기
    }

    if (typeof mapping === 'string') {
      // 단순 매핑
      updates[mapping] = outputValue;
    } else if (typeof mapping === 'object') {
      // 특수 처리 (path 추가 등)
      const { envVar, appendPath } = mapping;
      let finalValue = outputValue;

      if (appendPath) {
        // URL 끝에 path 추가
        finalValue = outputValue.replace(/\/$/, '') + '/' + appendPath;
      }

      updates[envVar] = finalValue;
    }
  });

  return updates;
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('🚀 API 엔드포인트 동기화 시작\n');

  if (isDryRun) {
    console.log('🔍 DRY-RUN 모드: 실제 파일은 수정되지 않습니다.\n');
  }

  // 1. CloudFormation Outputs 수집
  const outputs = await collectAllOutputs();

  // 2. 업데이트 맵 생성
  const updates = buildUpdatesMap(outputs);

  console.log(`📝 ${Object.keys(updates).length}개 환경 변수 업데이트 대상:\n`);
  Object.entries(updates).forEach(([key, value]) => {
    console.log(`   ${key} = ${value}`);
  });
  console.log('');

  // 3. 각 .env 파일 업데이트
  let totalChanged = 0;
  for (const envFile of ENV_FILES_TO_UPDATE) {
    const filePath = path.join(FRONTEND_DIR, envFile);
    console.log(`📄 ${envFile} 업데이트 중...`);

    const changed = updateEnvFile(filePath, updates);
    if (changed) totalChanged++;

    console.log('');
  }

  // 4. 완료 메시지
  if (isDryRun) {
    console.log('🔍 DRY-RUN 완료: 실제 변경사항 없음');
  } else {
    console.log(`✅ 동기화 완료: ${totalChanged}개 파일 업데이트됨`);
  }

  console.log('\n💡 다음 단계:');
  console.log('   1. git diff로 변경사항 확인');
  console.log('   2. 프론트엔드 재빌드 및 배포');
}

// 실행
main().catch(error => {
  console.error('\n❌ 에러 발생:', error);
  process.exit(1);
});
