# Nasun Website Admin Page 구축 계획서

## 1. 개요
나선(Nasun) 웹사이트의 운영 안정성 확보, 데이터 무결성 관리, 그리고 효율적인 커뮤니티 대응을 위한 관리자(Admin) 전용 페이지의 기능 및 우선순위를 정의합니다.

---

## 2. 기능 목록 및 우선순위

### 🚨 1순위: Critical (운영 안정성 및 긴급 대응)
서비스 장애를 방지하거나 장애 발생 시 즉각적인 조치가 가능한 기능입니다.

| 기능명 | 설명 및 필요성 | 구현 방안 |
| :--- | :--- | :--- |
| **X (Twitter) Health Monitor** | OAuth 토큰 유효성 및 API Rate Limit 상태 실시간 표시. 토큰 만료 전 경고 및 수동 갱신 기능. | `nasun-refresh-oauth2-token` Lambda 상태 및 Secrets Manager 연동 |
| **Leaderboard Season Config** | 프론트엔드 재배포 없이 리더보드 시즌 활성화/비활성화 제어. | DynamoDB Config 테이블 또는 Lambda 환경변수 제어 API |
| **User Ban / Blocklist** | 어뷰징(부정행위) 사용자를 리더보드 및 서비스에서 즉시 차단. | `UserProfiles` 테이블에 `isBanned` 필드 추가 및 필터링 |
| **Pipeline Status Dashboard** | 데이터 수집 파이프라인(Step Functions) 성공/실패 모니터링 및 수동 재시작(Retry). | AWS SDK (`listExecutions`, `startExecution`) 활용 |

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
| **Governance Hider** | 부적절한 온체인 프로포절을 프론트엔드 목록에서 숨김 처리. | 별도 `HiddenProposals` DB 목록 관리 |
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

1.  **접근 제어**:
    *   **IP 화이트리스트**: 특정 IP(개발자 VPN 등)에서만 접근 가능하도록 WAF 설정 권장.
    *   **권한 부여**: `UserProfiles`에 `role: 'admin'` 필드를 추가하여 특정 지갑 주소로 로그인한 경우만 접근 허용.
2.  **경로 보안**: 추측하기 어려운 별도 경로(예: `/admin-portal-secure-v1`) 또는 서브도메인을 사용합니다.
3.  **감사 로그**: 관리자가 수행한 모든 액션(Ban, Config 변경 등)은 DynamoDB에 로그로 기록합니다.

---

## 4. 향후 로드맵
*   **Phase 1**: 1순위(Critical) 기능을 포함한 최소 기능 제품(MVP) 구축.
*   **Phase 2**: CS 대응을 위한 User Inspector 및 점수 보정 기능 추가.
*   **Phase 3**: 통계 및 운영 자동화 기능 고도화.
