#!/usr/bin/env node

/**
 * OpenSea Allowlist CSV Export Script
 *
 * @description
 * DynamoDB에서 NFT Whitelist 데이터를 조회하여 OpenSea 형식의 CSV 파일을 생성합니다.
 *
 * @usage
 * node export-opensea-allowlist.js                  # 두 파일 모두 생성
 * node export-opensea-allowlist.js --table=founders # Founders Whitelist만
 * node export-opensea-allowlist.js --table=event    # Event Whitelist만
 * node export-opensea-allowlist.js --dry-run        # 미리보기 (파일 생성 안함)
 *
 * @output
 * - output/founders-allowlist-{timestamp}.csv
 * - output/event-allowlist-{timestamp}.csv
 *
 * @author Claude Code
 * @date 2025-10-26
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

// ========== 설정 ==========

const CONFIG = {
  region: process.env.AWS_REGION || 'ap-northeast-2',
  tables: {
    founders: {
      name: 'FoundersNftWhitelist',
      indexName: 'joinedAt-index',
      statusField: 'status',
      activeValue: 'ACTIVE',
    },
    event: {
      name: 'nasun-nft-whitelist',
      indexName: 'status-index',
      statusField: 'status',
      activeValue: 'ACTIVE',
    },
  },
  outputDir: path.join(__dirname, '../../output'),
};

// ========== DynamoDB 클라이언트 초기화 ==========

const client = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(client);

// ========== 유틸리티 함수 ==========

/**
 * 타임스탬프 생성 (파일명용)
 * @returns {string} ISO 8601 형식 타임스탬프 (예: 2025-10-26T123045)
 */
function generateTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

/**
 * 출력 디렉토리 생성
 */
function ensureOutputDir() {
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    console.log(`📁 출력 디렉토리 생성: ${CONFIG.outputDir}`);
  }
}

// ========== DynamoDB 조회 ==========

/**
 * DynamoDB에서 ACTIVE 사용자 조회
 *
 * @param {string} tableType - 'founders' | 'event'
 * @returns {Promise<Array>} ACTIVE 사용자 목록
 */
async function queryActiveUsers(tableType) {
  const config = CONFIG.tables[tableType];

  console.log(`\n🔍 ${config.name} 테이블 조회 중...`);
  console.log(`   - GSI: ${config.indexName}`);
  console.log(`   - 조건: ${config.statusField} = ${config.activeValue}`);

  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: config.name,
        IndexName: config.indexName,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': config.statusField,
        },
        ExpressionAttributeValues: {
          ':status': config.activeValue,
        },
      })
    );

    const items = result.Items || [];
    console.log(`✅ ${items.length}개의 ACTIVE 사용자 조회 완료`);

    return items;
  } catch (error) {
    console.error(`❌ DynamoDB 조회 실패:`, error.message);
    throw error;
  }
}

// ========== CSV 변환 ==========

/**
 * OpenSea Allowlist CSV 형식으로 변환
 *
 * @param {Array} users - 사용자 목록
 * @returns {string} CSV 문자열
 */
function convertToOpenSeaCsv(users) {
  console.log(`\n📝 OpenSea CSV 변환 중... (${users.length}개 항목)`);

  // 헤더
  const header = 'Wallet address,Custom mint limit (optional),Custom price in native token e.g. ETH (optional)';

  // 지갑 주소 추출 및 정규화 (소문자)
  const addresses = users
    .map((user) => user.walletAddress)
    .filter(Boolean)
    .map((addr) => addr.toLowerCase());

  // 중복 제거
  const uniqueAddresses = [...new Set(addresses)];

  console.log(`   - 원본: ${addresses.length}개`);
  console.log(`   - 중복 제거 후: ${uniqueAddresses.length}개`);

  // CSV 데이터 행 (mint limit, price는 빈 값)
  const rows = uniqueAddresses.map((addr) => `${addr},,`);

  // 헤더 + 데이터 결합
  const csvContent = [header, ...rows].join('\n');

  console.log(`✅ CSV 변환 완료`);

  return csvContent;
}

// ========== 파일 저장 ==========

/**
 * CSV 파일 저장
 *
 * @param {string} csvContent - CSV 문자열
 * @param {string} tableType - 'founders' | 'event'
 * @param {boolean} dryRun - Dry-run 모드 여부
 * @returns {string|null} 저장된 파일 경로 (dry-run 시 null)
 */
function saveCsvFile(csvContent, tableType, dryRun = false) {
  const timestamp = generateTimestamp();
  const filename = `${tableType}-allowlist-${timestamp}.csv`;
  const filepath = path.join(CONFIG.outputDir, filename);

  if (dryRun) {
    console.log(`\n🔍 [DRY-RUN] 파일 생성 시뮬레이션:`);
    console.log(`   - 경로: ${filepath}`);
    console.log(`   - 크기: ${csvContent.length} bytes`);
    console.log(`   - 미리보기 (첫 3줄):`);
    const preview = csvContent.split('\n').slice(0, 3).join('\n');
    console.log(`\n${preview}\n`);
    return null;
  }

  ensureOutputDir();

  try {
    fs.writeFileSync(filepath, csvContent, 'utf8');
    console.log(`\n✅ 파일 저장 완료:`);
    console.log(`   📄 ${filepath}`);
    console.log(`   📦 크기: ${(csvContent.length / 1024).toFixed(2)} KB`);

    return filepath;
  } catch (error) {
    console.error(`❌ 파일 저장 실패:`, error.message);
    throw error;
  }
}

// ========== 메인 함수 ==========

/**
 * 특정 테이블의 Allowlist CSV 생성
 *
 * @param {string} tableType - 'founders' | 'event'
 * @param {boolean} dryRun - Dry-run 모드 여부
 */
async function exportAllowlist(tableType, dryRun = false) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 ${tableType.toUpperCase()} ALLOWLIST 생성 시작`);
  console.log(`${'='.repeat(60)}`);

  try {
    // 1. DynamoDB 조회
    const users = await queryActiveUsers(tableType);

    if (users.length === 0) {
      console.log(`\n⚠️  ACTIVE 사용자가 없습니다. CSV 파일을 생성하지 않습니다.`);
      return null;
    }

    // 2. CSV 변환
    const csvContent = convertToOpenSeaCsv(users);

    // 3. 파일 저장
    const filepath = saveCsvFile(csvContent, tableType, dryRun);

    return filepath;
  } catch (error) {
    console.error(`\n❌ ${tableType.toUpperCase()} Allowlist 생성 실패:`, error.message);
    throw error;
  }
}

/**
 * 메인 진입점
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║       OpenSea Allowlist CSV Export Script                    ║
║                                                               ║
║  두 개의 NFT Whitelist를 OpenSea 형식 CSV로 변환합니다      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // CLI 인자 파싱
  const args = process.argv.slice(2);
  const tableArg = args.find((arg) => arg.startsWith('--table='));
  const dryRun = args.includes('--dry-run');

  const tableType = tableArg ? tableArg.split('=')[1] : 'all';

  if (dryRun) {
    console.log('🔍 [DRY-RUN MODE] 실제 파일을 생성하지 않습니다.\n');
  }

  // AWS 리전 확인
  console.log(`📍 AWS Region: ${CONFIG.region}\n`);

  try {
    const results = [];

    if (tableType === 'all') {
      // 두 테이블 모두 생성
      console.log('📋 두 개의 Allowlist를 생성합니다.\n');

      const foundersPath = await exportAllowlist('founders', dryRun);
      const eventPath = await exportAllowlist('event', dryRun);

      if (foundersPath) results.push(foundersPath);
      if (eventPath) results.push(eventPath);
    } else if (tableType === 'founders' || tableType === 'event') {
      // 특정 테이블만 생성
      const filepath = await exportAllowlist(tableType, dryRun);
      if (filepath) results.push(filepath);
    } else {
      throw new Error(`잘못된 --table 옵션: ${tableType} (사용 가능: founders, event, all)`);
    }

    // 결과 요약
    console.log(`\n${'='.repeat(60)}`);
    if (dryRun) {
      console.log(`✅ DRY-RUN 완료`);
    } else {
      console.log(`✅ 모든 작업 완료!`);
      console.log(`\n📂 생성된 파일:`);
      results.forEach((filepath, index) => {
        console.log(`   ${index + 1}. ${filepath}`);
      });
    }
    console.log(`${'='.repeat(60)}\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ 치명적 오류:`, error.message);
    console.error(`\n🔧 트러블슈팅:`);
    console.error(`   1. AWS CLI 설정 확인: aws configure list`);
    console.error(`   2. DynamoDB 읽기 권한 확인`);
    console.error(`   3. 테이블 이름 확인: FoundersNftWhitelist, nasun-nft-whitelist`);
    console.error(`   4. 자세한 가이드: /doc/OPENSEA_ALLOWLIST_EXPORT_GUIDE.md\n`);
    process.exit(1);
  }
}

// ========== 스크립트 실행 ==========

if (require.main === module) {
  main();
}

module.exports = {
  queryActiveUsers,
  convertToOpenSeaCsv,
  saveCsvFile,
  exportAllowlist,
};
