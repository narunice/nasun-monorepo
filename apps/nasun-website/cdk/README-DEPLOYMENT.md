# CDK 배포 가이드

**작성일**: 2025-09-20  
**버전**: 1.0  
**목적**: NASUN 프로젝트 CDK 배포 최적화 및 자동화

---

## 🚀 빠른 시작

### 1. 환경 설정
```bash
# CDK 루트 디렉토리로 이동
cd <MONOREPO>/nasun-website/cdk

# 의존성 설치
pnpm install
```

### 2. Lambda 함수만 빠르게 업데이트
```bash
# 모든 Lambda 함수 업데이트
./update-lambda-only.sh

# 특정 함수만 업데이트
./update-lambda-only.sh --function cumulative-score-calculator-v2

# 빌드 없이 업데이트 (이미 빌드된 경우)
./update-lambda-only.sh --no-build
```

### 3. 전체 배포
```bash
# 기본 배포 (권장)
./deploy-optimized.sh

# 차이점만 확인 (실제 배포 없음)
./deploy-optimized.sh --dry-run

# 강제 배포 (의존성 오류 무시)
./deploy-optimized.sh --force

# 타임아웃 연장
./deploy-optimized.sh --timeout 900
```

---

## 📋 스크립트 상세 설명

### `cleanup-build-files.sh`
빌드 파일과 임시 파일들을 정리하여 디스크 공간을 절약합니다.

**주요 기능**:
- 7일 이상 된 ZIP 파일 삭제
- 컴파일된 .js/.d.ts 파일 정리
- CDK 출력 디렉토리 (cdk.out) 삭제
- 빌드 디렉토리 (dist, dist-bundled) 정리
- 임시 파일 제거

**사용법**:
```bash
./cleanup-build-files.sh
```

### `deploy-optimized.sh`
안전하고 효율적인 CDK 배포를 위한 종합 스크립트입니다.

**주요 기능**:
- 환경 검증 (AWS 자격 증명, CDK 설정)
- 자동 의존성 설치
- Lambda 함수 빌드
- 배포 전 차이점 확인
- 타임아웃 및 오류 처리
- 배포 후 상태 확인

**옵션**:
- `--timeout SECONDS`: 배포 타임아웃 설정 (기본: 600초)
- `--approval MODE`: 승인 모드 (never/never-no-changeset)
- `--force`: 의존성 오류 무시하고 강제 배포
- `--lambda-only`: Lambda 함수만 업데이트
- `--dry-run`: 차이점만 확인, 실제 배포 없음
- `--help`: 도움말 표시

### `update-lambda-only.sh`
CDK 전체 배포 없이 Lambda 함수 코드만 빠르게 업데이트합니다.

**주요 기능**:
- X 리더보드 V2 함수들 자동 감지
- 개별 또는 전체 함수 업데이트
- 빌드부터 배포까지 원스톱
- 함수 상태 확인

**지원하는 함수들**:
- `cumulative-data-collector-v2`
- `cumulative-score-calculator-v2`
- `cumulative-leaderboard-generator-v2`
- `target-bookmark-collector-v2`
- `target-retweet-collector-v2`

**옵션**:
- `--function NAME`: 특정 함수만 업데이트
- `--no-build`: 빌드 과정 건너뛰기
- `--help`: 도움말 표시

---

## 🛠️ 사용 시나리오

### 시나리오 1: 코드 수정 후 빠른 배포
```bash
# 1. 코드 수정 후
./update-lambda-only.sh --function cumulative-score-calculator-v2

# 2. 모든 함수에 영향이 있는 경우
./update-lambda-only.sh
```

### 시나리오 2: 새로운 리소스 추가 후 전체 배포
```bash
# 1. 빌드 파일 정리 (선택적)
./cleanup-build-files.sh

# 2. 전체 배포
./deploy-optimized.sh
```

### 시나리오 3: 배포 문제 해결
```bash
# 1. 차이점 먼저 확인
./deploy-optimized.sh --dry-run

# 2. 의존성 오류가 있는 경우 강제 배포
./deploy-optimized.sh --force

# 3. 여전히 문제가 있으면 Lambda만 업데이트
./deploy-optimized.sh --lambda-only
```

### 시나리오 4: 운영 환경 배포 (신중한 접근)
```bash
# 1. 빌드 파일 정리
./cleanup-build-files.sh

# 2. 차이점 검토
./deploy-optimized.sh --dry-run

# 3. 실제 배포 (승인 필요)
./deploy-optimized.sh --approval never-no-changeset

# 4. 배포 후 Lambda 함수 상태 확인
aws lambda list-functions --query "Functions[?contains(FunctionName, 'nasun')]"
```

---

## ⚠️ 주의사항

### 배포 실패 시 대응
1. **Circular Dependency 오류**:
   ```bash
   ./deploy-optimized.sh --lambda-only
   ```

2. **타임아웃 오류**:
   ```bash
   ./deploy-optimized.sh --timeout 900
   ```

3. **권한 오류**:
   ```bash
   aws sts get-caller-identity  # AWS 자격 증명 확인
   ```

### 롤백 방법
```bash
# CloudFormation 콘솔에서 스택 상태 확인
aws cloudformation describe-stacks --stack-name CdkStack

# 이전 버전으로 Lambda 함수 롤백 (필요시)
aws lambda update-function-code --function-name FUNCTION_NAME --s3-bucket BUCKET --s3-key KEY
```

---

## 📊 성능 최적화

### 디스크 공간 관리
```bash
# 현재 크기 확인
du -sh . cdk.out lambda-src/*/dist* lambda-src/*/*.zip 2>/dev/null

# 정기적 정리 (권장: 주 1회)
./cleanup-build-files.sh
```

### 배포 시간 단축
- **Lambda 함수만 변경**: `./update-lambda-only.sh` (1-2분)
- **인프라 변경**: `./deploy-optimized.sh` (5-10분)
- **전체 재배포**: `./cleanup-build-files.sh && ./deploy-optimized.sh` (10-15분)

### 메모리 사용량 최적화
```bash
# node_modules 정리 후 재설치
rm -rf node_modules lambda-src/*/node_modules
pnpm install
```

---

## 🔍 트러블슈팅

### 일반적인 문제들

**1. "CDK 루트 디렉토리에서 실행해주세요"**
```bash
cd <MONOREPO>/nasun-website/cdk
```

**2. "AWS 자격 증명이 설정되지 않았습니다"**
```bash
aws configure list
aws sts get-caller-identity
```

**3. "pnpm이 설치되지 않았습니다"**
```bash
npm install -g pnpm
```

**4. Lambda 함수 업데이트 실패**
```bash
# 함수 존재 확인
aws lambda get-function --function-name FUNCTION_NAME

# 함수 상태 확인
aws lambda get-function --function-name FUNCTION_NAME --query 'Configuration.State'
```

### 로그 확인
```bash
# CloudWatch 로그 그룹 확인
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/nasun"

# 최근 로그 스트림 확인
aws logs describe-log-streams --log-group-name "/aws/lambda/nasun-cumulative-score-calculator-v2" --order-by LastEventTime --descending
```

---

## 📈 모니터링

### 배포 후 확인사항
1. **Lambda 함수 상태**:
   ```bash
   aws lambda list-functions --query "Functions[?contains(FunctionName, 'nasun')].{Name:FunctionName,State:State,LastModified:LastModified}"
   ```

2. **EventBridge 스케줄 상태**:
   ```bash
   aws events list-rules --name-prefix "V2-"
   ```

3. **DynamoDB 테이블 상태**:
   ```bash
   aws dynamodb describe-table --table-name nasun-leaderboard-cumulative-v2
   ```

### 성능 메트릭
- **배포 시간**: 목표 < 10분
- **Lambda 함수 업데이트**: 목표 < 2분
- **디스크 사용량**: 정리 후 < 1GB

---

## 🏷️ 버전 관리

### 태그 기반 배포
```bash
# 현재 버전 확인
git describe --tags

# 새 태그 생성
git tag -a v2.1.0 -m "Phase 1 사용자 정보 보존 로직 추가"

# 태그 기반 배포 로그
echo "v2.1.0: $(date)" >> deployment-history.log
```

### 변경사항 추적
- 모든 스크립트 실행은 로그와 함께 기록
- 중요한 배포는 git 태그와 함께 진행
- 롤백 계획을 사전에 수립

---

**문서 버전**: 1.0  
**최종 업데이트**: 2025-09-20  
**작성자**: Claude Code  
**검토자**: NASUN 개발팀