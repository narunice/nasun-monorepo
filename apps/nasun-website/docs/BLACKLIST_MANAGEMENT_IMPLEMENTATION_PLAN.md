# 리더보드 블랙리스트 관리 시스템 구현 계획서

## 1. 개요

현재 리더보드에서 어뷰징 사용자를 제외하는 블랙리스트 기능은 `EXCLUDED_USERNAMES`, `EXCLUDED_USER_IDS` 환경변수에 의존하고 있습니다. 이는 차단 목록 업데이트 시마다 백엔드 재배포가 필요하여 운영 효율성이 떨어집니다. 이를 Admin Dashboard에서 실시간으로 관리할 수 있도록 **DynamoDB 기반의 동적 관리 시스템**으로 전환합니다.

### 1.1 현황 (AS-IS)
- **저장소**: Lambda 환경변수 (`cdk/.env`)
- **관리 방식**: 수동으로 `.env` 수정 후 `cdk deploy` 실행
- **적용 로직**: `AccountFilterService`가 환경변수를 로드하여 메모리에 캐싱
- **문제점**: 실시간 대응 불가, 배포 리스크 존재, 관리 이력 추적 불가

### 1.2 목표 (TO-BE)
- **저장소**: DynamoDB `UserProfiles` 테이블
- **관리 방식**: Admin Dashboard UI를 통한 즉시 차단/해제
- **적용 로직**: `AccountFilterService`가 DynamoDB를 주기적으로 조회하여 캐싱
- **장점**: 무중단 운영, 즉각적인 어뷰징 대응, 차단 사유 기록 가능

---

## 2. 데이터베이스 설계

기존 `UserProfiles` 테이블(AuthStack에서 관리)을 확장하여 차단 상태를 관리합니다.

### 2.1 스키마 변경

`UserProfiles` 테이블에 다음 필드를 추가합니다.

| 필드명 | 타입 | 설명 | 비고 |
| :--- | :--- | :--- | :--- |
| `isBanned` | Boolean | 차단 여부 (true: 차단됨) | GSI Partition Key |
| `banReason` | String | 차단 사유 (예: "Bot activity", "Spam") | |
| `bannedAt` | String | 차단 일시 (ISO 8601) | |
| `bannedBy` | String | 차단한 관리자 ID | 감사 로그용 |

### 2.2 Global Secondary Index (GSI) 추가

차단된 사용자 목록을 효율적으로 조회하기 위해 새로운 인덱스를 추가합니다.

- **Index Name**: `isBanned-index`
- **Partition Key**: `isBanned` (String 또는 Number로 변환 필요할 수 있음, Boolean은 키로 직접 사용 불가한 경우 문자열 "true" 사용 권장)
- **Projection**: `ALL` 또는 필요한 필드(`userId`, `username`, `banReason` 등)

> **참고**: DynamoDB에서 Boolean을 Key로 사용할 수 없는 경우, `userStatus` (ACTIVE | BANNED) 같은 상태 필드를 도입하거나, `isBanned`를 문자열 "true"로 저장하는 방식을 사용합니다. 기존 데이터 마이그레이션 최소화를 위해 `isBanned` (String) 추가를 권장합니다.

---

## 3. 백엔드 구현 계획

### 3.1 CDK 인프라 수정 (`auth-stack.ts`)
- `UserProfiles` 테이블에 `isBanned-index` GSI 추가.
- `admin-api` Lambda에 `UserProfiles` 테이블 읽기/쓰기 권한 부여.
- `x-leaderboard` Lambda에 `UserProfiles` 테이블 읽기 권한 부여.

### 3.2 `admin-api` 확장
새로운 핸들러(`user-management.ts`)를 추가하고 API Gateway에 연결합니다.

| 메서드 | 경로 | 설명 |
| :--- | :--- | :--- |
| `GET` | `/admin/users/banned` | 차단된 사용자 목록 조회 (GSI 활용) |
| `POST` | `/admin/users/{userId}/ban` | 특정 사용자 차단 (`isBanned`=true 업데이트) |
| `POST` | `/admin/users/{userId}/unban` | 차단 해제 (`isBanned` 제거 또는 false) |
| `GET` | `/admin/users/search?q={query}` | 사용자 검색 (기존 로직 활용 또는 신규 구현) |

### 3.3 `AccountFilterService` 리팩토링 (`x-leaderboard`)
기존 `loadExcludedAccountsConfig` 함수를 수정하여 하이브리드 로직을 구현합니다.

1.  **1단계**: 환경변수(`EXCLUDED_USER_IDS`) 로드 (하위 호환성 및 긴급 차단용).
2.  **2단계**: DynamoDB `isBanned-index` 쿼리하여 차단된 `userId` 목록 수집.
3.  **병합**: 두 목록을 합쳐서 메모리에 캐싱.
4.  **캐싱 전략**: 현재 5분 캐싱 유지 (DynamoDB 부하 방지).

**수정 대상 파일**:
- `apps/nasun-website/cdk/lambda-src/x-leaderboard/src/utils/excluded-accounts-utils.ts`
- `apps/nasun-website/cdk/lambda-src/x-leaderboard/src/services/account-filter-service.ts`

---

## 4. 프론트엔드 구현 계획

### 4.1 Admin Dashboard 페이지 추가 (`UserBanManagement`)
- **위치**: `/admin/users` (신규 라우트)
- **주요 기능**:
    - **차단 목록 뷰**: 테이블 형태 (User ID, Username, 사유, 차단일).
    - **검색 및 차단**: 사용자명/ID로 검색 -> "Ban" 버튼 -> 사유 입력 모달 -> 차단 실행.
    - **차단 해제**: 목록에서 "Unban" 버튼 클릭.

### 4.2 API 연동
- `adminService.ts`에 관련 API 호출 함수 추가.

---

## 5. 마이그레이션 전략

서비스 중단 없이 안전하게 전환합니다.

1.  **Step 1 (인프라)**: `UserProfiles` 테이블 GSI 추가 배포.
2.  **Step 2 (데이터)**: 기존 환경변수에 있는 차단 목록을 스크립트를 통해 DynamoDB로 일괄 업데이트 (`isBanned`=true).
3.  **Step 3 (백엔드)**: `x-leaderboard` 로직 수정 (DB 참조 추가) 및 배포. 환경변수는 비상용 백업으로 유지.
4.  **Step 4 (프론트엔드)**: Admin 페이지 배포 및 운영 시작.
5.  **Step 5 (클린업)**: 안정화 후 환경변수에서 중복 데이터 제거 (선택 사항).

---

## 6. 단계별 구현 로드맵

### Phase 1: 인프라 및 데이터 준비
- [ ] `UserProfiles` 테이블 GSI (`isBanned-index`) 추가 (CDK)
- [ ] 마이그레이션 스크립트 작성 및 실행 (환경변수 -> DB)

### Phase 2: 백엔드 API 구현
- [ ] `admin-api`에 User Management 핸들러 추가
- [ ] API Gateway 엔드포인트 연결

### Phase 3: 리더보드 로직 연동
- [ ] `AccountFilterService`가 DynamoDB를 조회하도록 수정
- [ ] 캐싱 로직 검증 및 최적화

### Phase 4: 프론트엔드 UI 개발
- [ ] Admin Dashboard에 'User Management' 메뉴 추가
- [ ] 차단/해제 UI 구현 및 API 연동

### Phase 5: 테스트 및 배포
- [ ] Dev 환경 배포 및 기능 검증
- [ ] Prod 환경 배포
