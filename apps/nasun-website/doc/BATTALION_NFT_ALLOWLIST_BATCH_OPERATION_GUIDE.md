# Battalion NFT Allowlist Batch 운영 가이드

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Author**: Claude Code

---

## 목차

1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [배치 전환 절차](#배치-전환-절차)
4. [CSV Export 방법](#csv-export-방법)
5. [DynamoDB 데이터 구조](#dynamodb-데이터-구조)
6. [문제 해결](#문제-해결)
7. [롤백 절차](#롤백-절차)

---

## 개요

### 목적

Battalion NFT 이벤트에서 사용자를 **Allowlist Batch**로 그룹화하여 관리합니다. 각 배치는 약 2주 간격으로 운영되며, OpenSea에 배치별 CSV를 업로드하여 민팅 권한을 부여합니다.

### 핵심 특징

- **한 지갑 = 한 번 참여**: 동일 지갑 주소는 모든 배치 통틀어 1회만 등록 가능
- **배치별 CSV Export**: `?batch=N` 파라미터로 특정 배치만 추출
- **환경 변수 기반 배치 전환**: 코드 수정 없이 배치 ID 변경 가능

### 배치 일정 예시

| Batch ID | 기간 | 설명 |
|----------|------|------|
| 1 | 2025-12-12 ~ 2025-12-25 | 첫 번째 Allowlist |
| 2 | 2025-12-26 ~ 2026-01-08 | 두 번째 Allowlist |
| 3 | 2026-01-09 ~ 2026-01-22 | 세 번째 Allowlist |

---

## 시스템 아키텍처

```
[사용자] → [Frontend] → [API Gateway] → [register-user Lambda]
                                              ↓
                                    [NftWhitelist DynamoDB]
                                              ↓
                               GSI: batch-index (allowlistBatchId, verifiedAt)
                                              ↓
                              [export-csv Lambda] → [CSV 파일]
```

### 주요 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `register-user` Lambda | 사용자 등록 시 `allowlistBatchId` 저장 |
| `export-csv` Lambda | 배치별 또는 전체 CSV 생성 |
| `NftWhitelist` 테이블 | 사용자 등록 데이터 저장 |
| `batch-index` GSI | 배치별 빠른 조회 지원 |

---

## 배치 전환 절차

### 1단계: 현재 배치 확인

```bash
# 현재 설정된 배치 ID 확인
cat cdk/.env | grep CURRENT_BATCH_ID
# 예상 출력: CURRENT_BATCH_ID=1
```

### 2단계: 환경 변수 수정

```bash
# cdk/.env 파일 수정
vi cdk/.env

# 변경 전
CURRENT_BATCH_ID=1

# 변경 후
CURRENT_BATCH_ID=2
```

### 3단계: CDK 재배포

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 개발 환경
pnpm deploy:dev

# 프로덕션 환경
pnpm deploy:prod
```

### 4단계: Lambda 환경 변수 확인

```bash
# register-user Lambda 환경 변수 확인
aws lambda get-function-configuration \
  --function-name nasun-register-user \
  --query "Environment.Variables.CURRENT_BATCH_ID" \
  --output text \
  --region ap-northeast-2

# 예상 출력: 2
```

### 5단계: 테스트

1. 새로운 지갑으로 `/wave1/battalion-nft` 페이지 접속
2. 모든 단계 완료 후 등록
3. Step 6에서 "Allowlist #2" 표시 확인

---

## CSV Export 방법

### API 엔드포인트

```
GET /admin/export-csv?batch={batchId}
```

### 사용 예시

#### 특정 배치 Export

```bash
# Batch 1만 추출
curl -X GET "https://API_GATEWAY_URL/prod/admin/export-csv?batch=1" \
  -H "x-api-key: YOUR_API_KEY"

# Batch 2만 추출
curl -X GET "https://API_GATEWAY_URL/prod/admin/export-csv?batch=2" \
  -H "x-api-key: YOUR_API_KEY"
```

#### 전체 Export

```bash
# 모든 배치 추출 (batch 파라미터 생략)
curl -X GET "https://API_GATEWAY_URL/prod/admin/export-csv" \
  -H "x-api-key: YOUR_API_KEY"
```

### 응답 형식

**성공 시 (200 OK)**:
```
Content-Type: text/csv
Content-Disposition: attachment; filename="wave1-battalion-2025-12-12T10-30-00-000Z.csv"

0x742d35cc6634c0532925a3b844bc9e7595f0beb7
0x1234567890abcdef1234567890abcdef12345678
0xabcdef1234567890abcdef1234567890abcdef12
```

**배치에 데이터 없음 (200 OK)**:
```json
{
  "success": true,
  "message": "No whitelist entries found for batch 3"
}
```

### OpenSea 업로드

1. CSV 파일 다운로드
2. OpenSea Studio → Collection → Allowlist
3. CSV 파일 업로드
4. "Save" 클릭

---

## DynamoDB 데이터 구조

### NftWhitelist 테이블

| 필드 | 타입 | 설명 |
|------|------|------|
| `walletAddress` (PK) | String | 지갑 주소 (소문자 정규화) |
| `xUserId` | String | X(Twitter) User ID |
| `xUsername` | String | X(Twitter) Username |
| `verifiedAt` | String | 등록 시간 (ISO 8601) |
| `engagementScore` | Number | 참여도 점수 (초기값: 0) |
| `allowlistBatchId` | String | Allowlist Batch ID ("1", "2", "3", ...) |

### batch-index GSI

| 키 | 타입 | 설명 |
|----|------|------|
| `allowlistBatchId` (PK) | String | 배치 ID |
| `verifiedAt` (SK) | String | 등록 시간 (정렬용) |

### 조회 예시

```bash
# Batch 1의 모든 사용자 조회
aws dynamodb query \
  --table-name NftWhitelist \
  --index-name batch-index \
  --key-condition-expression "allowlistBatchId = :batchId" \
  --expression-attribute-values '{":batchId": {"S": "1"}}' \
  --region ap-northeast-2

# 특정 지갑 주소 조회
aws dynamodb get-item \
  --table-name NftWhitelist \
  --key '{"walletAddress": {"S": "0x742d35cc6634c0532925a3b844bc9e7595f0beb7"}}' \
  --region ap-northeast-2
```

---

## 문제 해결

### 문제 1: "이미 등록된 지갑입니다" 오류

**원인**: 해당 지갑이 이미 다른 배치에 등록됨

**해결**:
```bash
# 지갑 주소로 기존 등록 확인
aws dynamodb get-item \
  --table-name NftWhitelist \
  --key '{"walletAddress": {"S": "0x..."}}' \
  --region ap-northeast-2
```

**대응**:
- 사용자에게 이미 등록됨을 안내
- 필요시 DynamoDB에서 수동 삭제 (주의 필요)

### 문제 2: CSV Export 결과가 비어있음

**원인 1**: 해당 배치에 등록된 사용자 없음
```bash
# 배치별 사용자 수 확인
aws dynamodb query \
  --table-name NftWhitelist \
  --index-name batch-index \
  --key-condition-expression "allowlistBatchId = :batchId" \
  --expression-attribute-values '{":batchId": {"S": "1"}}' \
  --select COUNT \
  --region ap-northeast-2
```

**원인 2**: GSI가 아직 생성되지 않음
```bash
# 테이블 GSI 상태 확인
aws dynamodb describe-table \
  --table-name NftWhitelist \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='batch-index'].IndexStatus" \
  --region ap-northeast-2
```

### 문제 3: 새 배치 ID가 적용되지 않음

**확인**:
```bash
# Lambda 환경 변수 확인
aws lambda get-function-configuration \
  --function-name nasun-register-user \
  --query "Environment.Variables" \
  --region ap-northeast-2
```

**해결**: CDK 재배포 필요
```bash
cd cdk
pnpm deploy:dev  # 또는 pnpm deploy:prod
```

---

## 롤백 절차

### 배치 ID 롤백

현재 배치에서 이전 배치로 롤백하는 경우:

```bash
# 1. 환경 변수 복원
vi cdk/.env
# CURRENT_BATCH_ID=1  # 이전 값으로 변경

# 2. CDK 재배포
cd cdk
pnpm deploy:dev
```

### 전체 시스템 롤백

Allowlist Batch 기능 전체를 롤백하는 경우:

```bash
# Git 태그로 롤백
git checkout pre-allowlist-batch-system-20251212

# CDK 재배포
cd cdk
npm run build  # Lambda 재빌드
pnpm deploy:dev
```

### 데이터 복구

특정 사용자의 배치 ID 수정이 필요한 경우:

```bash
# 단일 항목 업데이트 (주의: 프로덕션에서는 신중히)
aws dynamodb update-item \
  --table-name NftWhitelist \
  --key '{"walletAddress": {"S": "0x..."}}' \
  --update-expression "SET allowlistBatchId = :newBatch" \
  --expression-attribute-values '{":newBatch": {"S": "1"}}' \
  --region ap-northeast-2
```

---

## 체크리스트

### 배치 전환 전 확인사항

- [ ] 현재 배치 CSV Export 완료
- [ ] OpenSea에 현재 배치 업로드 완료
- [ ] 새 배치 ID 결정 (이전 + 1)
- [ ] 배치 전환 일정 공지

### 배치 전환 후 확인사항

- [ ] Lambda 환경 변수 확인 (`CURRENT_BATCH_ID`)
- [ ] 테스트 등록 성공 확인
- [ ] Step 6 화면에서 새 배치 ID 표시 확인
- [ ] 이전 배치 등록자는 중복 등록 불가 확인

---

## 관련 문서

- [NFT Event Stack 코드](../cdk/lib/nft-event-stack.ts)
- [Register User Lambda](../cdk/lambda-src/nft-event/register-user/)
- [Export CSV Lambda](../cdk/lambda-src/nft-event/export-csv/)
- [Frontend Step6 컴포넌트](../frontend/src/components/app/wave1/battalion-nft/cards/Step6RegistrationSuccessCard.tsx)

---

## 연락처

기술 지원이 필요한 경우: development@nasun.io
