# Nasun Website Admin Page 구축 계획서

## 1. 개요
나선(Nasun) 웹사이트의 운영 안정성 확보, 데이터 무결성 관리, 그리고 효율적인 커뮤니티 대응을 위한 관리자(Admin) 전용 페이지의 기능 및 우선순위를 정의합니다.

### 현황 (2026-01-19)
- **Admin Dashboard**: 기본 레이아웃 및 라우팅 구현 완료 (`/admin`).
- **Whitelist Management**: Genesis NFT 및 Battalion NFT Allowlist CSV 내보내기 기능 구현 완료 (`/admin/whitelist`).
- **Governance Management**: 온체인 프로포절 생성 및 투표 현황 조회 기능 구현 완료 (`/admin/governance`).
- **Backend API**: `admin-api` (Whitelist Export), `governance-api` 구축 완료.

---

## 2. 기능 목록 및 우선순위

### ✅ 구현 완료 (Implemented)

| 기능명 | 설명 | 상태 |
| :--- | :--- | :--- |
| **Whitelist Export** | Genesis NFT 및 Battalion NFT Allowlist 데이터를 CSV로 추출. 날짜별 필터링 지원. | ✅ 완료 (`/admin/whitelist`) |
| **Governance Management** | 온체인 프로포절 생성(제목, 설명, 옵션 설정) 및 투표 현황 모니터링. | ✅ 완료 (`/admin/governance`) |
| **Admin Dashboard UI** | 관리자 페이지 진입점 및 카드형 레이아웃. | ✅ 완료 (`/admin`) |

### 🚨 1순위: Critical (운영 안정성 및 긴급 대응)
서비스 장애를 방지하거나 장애 발생 시 즉각적인 조치가 가능한 기능입니다.

| 기능명 | 설명 및 필요성 | 구현 방안 |
| :--- | :--- | :--- |
| **X (Twitter) Health Monitor** | OAuth 토큰 유효성 및 API Rate Limit 상태 실시간 표시. 토큰 만료 전 경고 및 수동 갱신 기능. | `nasun-refresh-oauth2-token` Lambda 상태 및 Secrets Manager 연동 |
| **User Ban / Blocklist** | 어뷰징(부정행위) 사용자를 리더보드 및 서비스에서 즉시 차단. | `UserProfiles` 테이블에 `isBanned` 필드 추가 및 필터링 UI |
| **Pipeline Status Dashboard** | 데이터 수집 파이프라인(Step Functions) 성공/실패 모니터링 및 수동 재시작(Retry). | AWS SDK (`listExecutions`, `startExecution`) 활용 |
| **Leaderboard Season Config** | 프론트엔드 재배포 없이 리더보드 시즌 활성화/비활성화 제어. | DynamoDB Config 테이블 또는 Lambda 환경변수 제어 API |

### ⚡ 2순위: High (CS 대응 및 데이터 검증)
사용자 문의에 대응하고 데이터 오류를 보정하기 위한 기능입니다.

| 기능명 | 설명 및 필요성 | 구현 방안 |
| :--- | :--- | :--- |
| **User Inspector (Deep Dive)** | 특정 사용자의 지갑, X 계정 연동 상태, 점수 산정 세부 내역(활동/인게이지먼트) 조회. | `UserProfiles` 및 활동 로그 통합 조회 API |
| **Score Recalculation** | 특정 사용자의 점수가 누락되거나 오류가 있을 경우 수동으로 점수 재계산 트리거. | 점수 계산 Lambda 단일 사용자 모드 호출 API |
| **Cache Purge** | 데이터 수정 사항 즉시 반영을 위한 API Gateway 캐시 무효화. | AWS SDK (`flushStageCache`) 연동 |

### 🛠️ 3순위: Medium (운영 효율화)
운영 편의성 및 마케팅 지원을 위한 기능입니다.

| 기능명 | 설명 및 필요성 | 구현 방안 |
| :--- | :--- | :--- |
| **Announcement Banner** | 웹사이트 최상단 공지사항(점검, 이벤트) 문구 수정 및 On/Off 토글. | DynamoDB `SystemConfig` 테이블 기반 전역 배너 컴포넌트 |
| **Bonus Simulator** | 활동 보너스 가중치 변경 시 전체 리더보드 순위 변동 시뮬레이션. | 로컬 계산 로직 기반의 시뮬레이터 UI |

### 📉 4순위: Low (통계 및 분석)
장기적인 서비스 분석을 위한 기능입니다.

| 기능명 | 설명 및 필요성 | 구현 방안 |
| :--- | :--- | :--- |
| **Growth Analytics** | 일별 신규 가입자, 지갑 연결, 리더보드 참여자 추이 시각화. | `UserProfiles` 생성일 기반 통계 쿼리 |
| **Top Climbers Preview** | 메인 페이지 'Top Climbers' 노출 목록 사전 검수. | 기존 `useTopClimbers` 훅 활용 |

---

## 3. 보안 고려사항 (필수)

관리자 전용 페이지는 일반 사용자에게 노출되지 않도록 강력한 보안이 적용되어야 합니다.

1.  **접근 제어 (구현됨)**:
    *   **AdminRoute**: 프론트엔드에서 `AdminRoute` 컴포넌트를 통해 특정 지갑 주소(관리자)만 접근하도록 제한하고 있습니다.
    *   **API Key**: 백엔드 API(`export-csv` 등)는 API Key를 통해 보호되고 있습니다.
2.  **향후 강화 계획**:
    *   **IP 화이트리스트**: WAF를 통해 특정 IP 대역 접근만 허용.
    *   **Role 기반 권한 관리 (RBAC)**: `UserProfiles` 테이블에 명시적인 `role: 'admin'` 필드 추가 및 검증 로직 강화.
3.  **경로 보안**: `/admin` 경로는 일반 메뉴에 노출되지 않으며, 인증되지 않은 사용자는 접근 시 리디렉션됩니다.
4.  **감사 로그**: 관리자가 수행한 모든 액션(Ban, Config 변경 등)은 DynamoDB에 로그로 기록합니다.

---

## 4. 향후 로드맵
*   **Phase 1 (완료)**: 기본 대시보드, Whitelist Export, Governance Management 구축.
*   **Phase 2 (Next)**: 운영 안정성을 위한 모니터링(X API Health, Pipeline Status) 및 User Ban 기능 구현.
*   **Phase 3**: CS 대응 도구(User Inspector) 및 설정 관리(Config) 기능 추가.
