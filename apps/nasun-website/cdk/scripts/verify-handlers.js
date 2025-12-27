#!/usr/bin/env node

/**
 * Handler Path Verification Script
 *
 * Purpose: CDK 배포 전 모든 Lambda 핸들러 경로 검증
 * - cdk-stack.ts에서 Lambda 정의 추출
 * - handler 경로와 실제 파일 존재 여부 확인
 * - 오류 발견 시 배포 중단
 *
 * Usage: node scripts/verify-handlers.js
 * Exit codes:
 *   0: 모든 핸들러 검증 성공
 *   1: 검증 실패 (배포 중단)
 */

const fs = require('fs');
const path = require('path');

// ANSI 색상 코드
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * cdk-stack.ts 파일에서 Lambda 정의 추출
 */
function extractLambdaDefinitions(cdkStackPath) {
  const content = fs.readFileSync(cdkStackPath, 'utf-8');
  const lambdas = [];

  // Regex: new lambda.Function( ... ) 블록 추출
  const functionRegex = /new lambda\.Function\([^,]+,\s*"([^"]+)",\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;

  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    const constructId = match[1];
    const propsBlock = match[2];

    // handler 경로 추출
    const handlerMatch = propsBlock.match(/handler:\s*["']([^"']+)["']/);
    // code asset 경로 추출
    const codeMatch = propsBlock.match(/code:\s*lambda\.Code\.fromAsset\(["']([^"']+)["']\)/);
    // functionName 추출
    const nameMatch = propsBlock.match(/functionName:\s*["']([^"']+)["']/);

    if (handlerMatch && codeMatch) {
      lambdas.push({
        constructId,
        functionName: nameMatch ? nameMatch[1] : constructId,
        handler: handlerMatch[1],
        assetPath: codeMatch[1]
      });
    }
  }

  return lambdas;
}

/**
 * 핸들러 파일 존재 여부 확인
 */
function verifyHandlerFile(lambda, baseDir) {
  const { handler, assetPath } = lambda;

  // handler 형식: "batch/collect-likes.handler" 또는 "index.handler"
  // 실제 파일: batch/collect-likes.js 또는 index.js
  const handlerFile = handler.replace('.handler', '.js');
  const fullPath = path.join(baseDir, assetPath, handlerFile);

  const result = {
    exists: fs.existsSync(fullPath),
    expectedPath: fullPath,
    handlerFile
  };

  // 특별 검증: auth-twitter Lambda
  // TypeScript 컴파일이 필요한 Lambda들은 추가 파일 검증
  if (assetPath === 'lambda-src/auth-twitter' || assetPath === 'lambda-src/link-account') {
    result.additionalChecks = checkTypeScriptCompilation(lambda, baseDir);
  }

  return result;
}

/**
 * TypeScript 컴파일 상태 확인
 */
function checkTypeScriptCompilation(lambda, baseDir) {
  const { assetPath } = lambda;
  const checks = {
    passed: true,
    details: []
  };

  // auth-twitter 필수 파일 목록
  if (assetPath === 'lambda-src/auth-twitter') {
    const requiredFiles = [
      'src/handlers/login.js',
      'src/handlers/callback.js',
      'src/utils/secrets.js',
      'src/utils/session-manager.js',
      'src/utils/twitter-api.js',
      'src/utils/cognito.js',
      'src/utils/pkce.js'
    ];

    requiredFiles.forEach(file => {
      const filePath = path.join(baseDir, assetPath, file);
      if (!fs.existsSync(filePath)) {
        checks.passed = false;
        checks.details.push({
          type: 'MISSING_COMPILED_FILE',
          file,
          message: `TypeScript 컴파일 필요: ${file} 파일이 없습니다`
        });
      }
    });
  }

  return checks;
}

/**
 * 일반적인 실수 감지
 */
function detectCommonMistakes(lambda) {
  const issues = [];

  // 실수 1: handler에 "dist/" 포함 (assetPath에 이미 dist 있음)
  if (lambda.handler.startsWith('dist/')) {
    issues.push({
      type: 'HANDLER_PATH_REDUNDANT_DIST',
      message: `handler에 "dist/" 포함됨. assetPath가 이미 "dist"를 포함하므로 제거 필요`,
      suggestion: lambda.handler.replace('dist/', '')
    });
  }

  // 실수 2: assetPath가 src/ (빌드되지 않음)
  if (lambda.assetPath.includes('/src')) {
    issues.push({
      type: 'ASSET_PATH_USES_SRC',
      message: `assetPath가 src 디렉토리 사용. 빌드된 dist 사용 권장`,
      suggestion: lambda.assetPath.replace('/src', '/dist')
    });
  }

  return issues;
}

/**
 * 메인 검증 로직
 */
function main() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('  Lambda Handler Path Verification', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  const baseDir = path.join(__dirname, '..');
  const cdkStackPath = path.join(baseDir, 'lib', 'cdk-stack.ts');

  // 1. cdk-stack.ts 존재 확인
  if (!fs.existsSync(cdkStackPath)) {
    log(`✗ cdk-stack.ts not found: ${cdkStackPath}`, 'red');
    process.exit(1);
  }

  // 2. Lambda 정의 추출
  log('📋 Extracting Lambda definitions from cdk-stack.ts...', 'blue');
  const lambdas = extractLambdaDefinitions(cdkStackPath);
  log(`   Found ${lambdas.length} Lambda functions\n`, 'blue');

  // 3. 각 Lambda 핸들러 검증
  let errors = 0;
  let warnings = 0;

  lambdas.forEach((lambda, index) => {
    const num = `[${index + 1}/${lambdas.length}]`;
    log(`${num} ${lambda.functionName}`, 'yellow');

    // 핸들러 파일 존재 확인
    const verification = verifyHandlerFile(lambda, baseDir);

    if (verification.exists) {
      log(`    ✓ Handler: ${lambda.handler}`, 'green');
      log(`    ✓ File: ${verification.handlerFile}`, 'green');
    } else {
      log(`    ✗ Handler: ${lambda.handler}`, 'red');
      log(`    ✗ File NOT FOUND: ${verification.expectedPath}`, 'red');
      errors++;
    }

    // 추가 검증 결과 출력 (TypeScript 컴파일 등)
    if (verification.additionalChecks) {
      if (!verification.additionalChecks.passed) {
        verification.additionalChecks.details.forEach(detail => {
          log(`    ✗ ${detail.type}: ${detail.message}`, 'red');
          if (detail.file) {
            log(`      Missing: ${detail.file}`, 'red');
          }
        });
        errors++;
        log(`    ℹ  Run: cd ${lambda.assetPath} && npm run build`, 'yellow');
      } else {
        log(`    ✓ TypeScript compilation verified`, 'green');
      }
    }

    // 일반적인 실수 감지
    const mistakes = detectCommonMistakes(lambda);
    if (mistakes.length > 0) {
      mistakes.forEach(mistake => {
        log(`    ⚠ ${mistake.type}`, 'yellow');
        log(`      ${mistake.message}`, 'yellow');
        if (mistake.suggestion) {
          log(`      Suggestion: "${mistake.suggestion}"`, 'yellow');
        }
        warnings++;
      });
    }

    console.log(); // 빈 줄
  });

  // 4. 결과 요약
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('  Verification Summary', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log(`Total Lambda Functions: ${lambdas.length}`, 'blue');
  log(`Errors: ${errors}`, errors > 0 ? 'red' : 'green');
  log(`Warnings: ${warnings}`, warnings > 0 ? 'yellow' : 'green');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  // 5. Exit code 결정
  if (errors > 0) {
    log('✗ Verification FAILED. Please fix errors before deployment.', 'red');
    process.exit(1);
  } else if (warnings > 0) {
    log('✓ Verification PASSED with warnings.', 'yellow');
    process.exit(0);
  } else {
    log('✓ All handlers verified successfully!', 'green');
    process.exit(0);
  }
}

// 실행
if (require.main === module) {
  try {
    main();
  } catch (error) {
    log(`\n✗ Verification script error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = { extractLambdaDefinitions, verifyHandlerFile, detectCommonMistakes };
