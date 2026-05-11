# Nasun Bug Report & Feedback System Technical Specification

**상태**: 운영 중 (Production)
**최근 업데이트**: 2026-05-11
**핵심 경로**:
- Frontend Submission: `apps/nasun-website/frontend/src/sections/myAccount/BugReportsCard.tsx`
- Admin UI: `apps/nasun-website/frontend/src/features/admin/pages/BugReportAdmin.tsx`
- Backend Lambda (User): `apps/nasun-website/cdk/lambda-src/bug-report/`
- Backend Lambda (Admin): `apps/nasun-website/cdk/lambda-src/bug-report-admin/`
- Reward API: `apps/network-explorer/api-server/src/routes/points.ts`

---

## 1. 시스템 개요 (System Overview)
사용자가 서비스 이용 중 발견한 버그나 개선 제안을 제출하고, 관리자가 이를 검토하여 적절한 **에코시스템 포인트(Ecosystem Points)**로 보상하는 시스템입니다. 단순한 피드백 루프를 넘어 사용자의 기여를 정량화하여 보상하는 거버넌스의 일환으로 작동합니다.

## 2. 아키텍처 및 파이프라인 (Architecture & Pipeline)

### 2.1 제출 단계 (Submission Phase)
1. **사용자 입력**: 사용자가 웹사이트의 'My Account' 페이지에서 버그 리포트 폼을 작성합니다. (제목, 대상 앱, 카테고리, 내용, 스크린샷 첨부 가능)
   - 제출 진입점은 섹션당 **"Submit Report" 버튼 1개**로 통일합니다. (별도의 "Submit Feedback" 버튼 추가 금지 — 동일 모달에서 카테고리로 분기)
2. **데이터 처리**: 프론트엔드는 입력값과 현재 세션의 `identityId`, `walletAddress`를 포함하여 API Gateway로 전송합니다.
3. **Lambda 처리 (`bug-report` Lambda)**:
    - 제출된 데이터를 **DynamoDB**(`nasun-bug-reports`)에 저장합니다.
    - 스크린샷은 **S3** 버킷에 업로드됩니다.
    - 운영팀이 즉시 확인할 수 있도록 **Telegram Bot**을 통해 알림을 전송합니다.

### 2.2 검토 및 보상 단계 (Review & Reward Phase)
1. **관리자 대시보드**: 어드민 권한을 가진 사용자가 `BugReportAdmin` 페이지에서 제출된 리포트를 목록화하여 확인합니다.
2. **상태 업데이트**: 관리자는 리포트의 상태를 변경(`investigating`, `fixed`, `accepted` 등)하고 관리자 노트를 작성합니다.
3. **포인트 지급 (`bug-report-admin` Lambda)**:
    - 리포트 상태가 **`fixed`** (버그) 또는 **`accepted`** (피드백/기능 제안)로 변경되고 `bonusPoints`가 0보다 클 때 보상 프로세스가 시작됩니다.
    - **Explorer API**의 `/api/v1/points/bug-report-reward` 엔드포인트로 보상 요청을 보냅니다.
4. **포인트 기록 (Explorer API)**:
    - `activity_points` 테이블에 새로운 레코드를 삽입합니다.
    - **멱등성(Idempotency)** 보장: `tx_digest`를 `bugreport:{reportId}` 또는 `feedback:{reportId}` 형식으로 생성하여 중복 지급을 원천 차단합니다.
    - 카테고리 구분: 버그는 `ecosystem-bonus-bugreport`, 피드백은 `ecosystem-bonus-feedback`으로 기록됩니다.

---

## 3. 기술적 세부 사항 (Technical Details)

### 3.1 분류 (Categories)
- **Bug 관련**: `UI Bug`, `Wallet Issue`, `Performance`, `Security`, `Other` (상태: `fixed` 시 보상)
- **Feedback 관련**: `Feedback`, `Feature Request` (상태: `accepted` 시 보상)

### 3.1.1 대상 앱 (App)
폼 제출 시 어떤 앱에 대한 리포트인지 사용자가 선택합니다. 제목과 카테고리 사이에 위치한 필수 셀렉트입니다.

- 허용값: `nasun`, `pado`, `gostop`, `network-explorer`, `general`
- 미지정/누락 시 백엔드는 `general`로 저장합니다.
- 백엔드 검증 위치: `cdk/lambda-src/bug-report/src/index.ts`의 `ALLOWED_APPS`.
- DynamoDB(`nasun-bug-reports`)에는 `app` 필드로 저장되며, Telegram 알림 본문(`App: <value>`)에도 포함됩니다.

### 3.2 데이터베이스 스키마 (DynamoDB: `nasun-bug-reports`)
| 필드 | 설명 |
| :--- | :--- |
| `reportId` | 고유 ID (Partition Key) |
| `timestamp` | 생성 일시 (Sort Key) |
| `identityId` | 제출자 Cognito ID |
| `app` | 대상 앱 (`nasun`/`pado`/`gostop`/`network-explorer`/`general`) |
| `walletAddress` | 보상받을 Sui 지갑 주소 |
| `status` | 현재 진행 상태 (`new`, `fixed`, `accepted`, `duplicate` 등) |
| `bonusPoints` | 부여된 보상 점수 (0-100) |
| `rewardStatus` | 포인트 지급 결과 상태 (`rewarded`, `pending`, `pending-no-wallet`) |

### 3.3 포인트 지급 무결성
- **Admin Auth**: 관리자 액션은 Cognito JWT Authorizer와 DynamoDB의 `UserProfiles` 테이블 내 `role === 'ADMIN'` 체크를 통해 엄격히 통제됩니다.
- **Double Reward Protection**: 포인트 지급 전 DynamoDB의 `rewardStatus`를 확인하고, Explorer API 수준에서 SQL의 `ON CONFLICT DO NOTHING`을 사용하여 중복 처리를 방지합니다.

---

## 4. 프론트엔드 구현 특징
- **Screenshot Support**: `react-dropzone`을 사용하여 드래그 앤 드롭으로 스크린샷을 첨부하며, Lambda가 생성한 Pre-signed URL을 통해 안전하게 S3에 업로드합니다.
- **Real-time Status**: 사용자는 본인의 계정 페이지에서 제출한 리포트의 처리 상태와 획득한 포인트를 실시간으로 확인할 수 있습니다.
