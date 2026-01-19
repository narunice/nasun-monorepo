# Nasun Website Admin Codebase Refactoring Plan

## 1. 개요
현재 Admin 페이지 코드베이스(`WhitelistManagement`, `GovernanceManagement` 등)는 기능 구현 중심의 MVP 단계로, UI와 비즈니스 로직이 강하게 결합되어 있습니다. 향후 기능 확장(User Ban, Pipeline Monitor 등) 시 발생할 수 있는 복잡도를 낮추고 유지보수 효율을 높이기 위한 리팩토링 방안을 제시합니다.

---

## 2. 핵심 리팩토링 과제

### 2.1 데이터 페칭 계층 분리 (React Query 도입)
**현황**: `GovernanceManagement.tsx` 등에서 `useEffect`와 `suiClient.getObject`를 사용해 데이터를 직접 로드하고 상태(`useState`)로 관리하고 있습니다.
**문제점**: 로딩/에러 상태 관리의 복잡성, 캐싱 부재로 인한 중복 RPC 호출, 컴포넌트 코드 비대화.
**해결 방안**:
- `@tanstack/react-query` 및 `@mysten/dapp-kit` 기반의 커스텀 훅으로 로직을 추상화합니다.
- `useAdminProposals`, `useProposalVoters` 등의 전용 훅을 생성하여 데이터 생명주기를 관리합니다.

### 2.2 SUI 데이터 파싱 로직의 모듈화
**현황**: SUI 온체인 객체 데이터를 읽기 쉬운 형태로 변환하는 파싱 함수(`parseProposalSummary` 등)가 컴포넌트 파일 하단에 위치해 있습니다.
**문제점**: 다른 페이지(유저용 거버넌스 등)에서 동일 로직 재사용 불가, 단위 테스트 작성의 어려움.
**해결 방안**:
- `features/admin/utils/suiParsers.ts` 파일을 생성하여 순수 로직을 분리합니다.
- 타입 정의(`ProposalSummary`, `VoterRecord`)를 `features/admin/types/`로 이동시켜 일관된 인터페이스를 제공합니다.

### 2.3 라우팅 구조 및 레이아웃 개선
**현황**: 모든 Admin 페이지가 개별적으로 `<AdminLayout>`을 래퍼로 사용하고 있습니다.
**문제점**: 불필요한 보일러플레이트 발생, 페이지 전환 시 레이아웃 재랜더링 가능성.
**해결 방안**:
- `AppRoutes.tsx`에서 **Nested Routes** 패턴을 적용합니다.
- `/admin` 경로를 부모로 두고 `AdminLayout`을 공통 래퍼로 설정하여 하위 페이지는 컨텐츠에만 집중하게 합니다.

---

## 3. 권장 폴더 구조 (Proposed)

`features/admin` 폴더를 도메인 주도 설계(DDD) 관점에서 세분화합니다.

```
frontend/src/features/admin/
├── components/         # Admin 전용 UI 컴포넌트 (AdminFeatureCard, StatsGrid 등)
├── hooks/              # 데이터 페칭 및 비즈니스 로직 훅 (useAdminStats, useProposals)
├── pages/              # 실제 라우팅 페이지 (UI 조립 위주, 로직 최소화)
├── services/           # 백엔드 API 및 RPC 호출 함수 (adminApi.ts)
├── utils/              # 온체인 데이터 파싱, 날짜 포맷팅 등 헬퍼 함수
└── types/              # Admin 도메인 공통 인터페이스 및 타입 정의
```

---

## 4. 실행 로드맵

### Step 1: 아키텍처 기반 마련 (High Priority)
- [ ] `features/admin/types` 생성 및 공통 인터페이스 추출.
- [ ] `features/admin/utils/suiParsers.ts` 생성 및 파싱 로직 이관.
- [ ] `GovernanceManagement.tsx`에서 비즈니스 로직을 `hooks/useAdminProposals.ts`로 분리.

### Step 2: 라우팅 및 레이아웃 최적화 (Medium Priority)
- [ ] `AppRoutes.tsx` 수정: Admin 관련 라우트를 `Route` 그룹으로 묶고 `AdminLayout` 통합.
- [ ] 개별 페이지 컴포넌트에서 중복된 `AdminLayout` 제거.

### Step 3: 성능 및 UX 고도화 (Low Priority)
- [ ] RPC 대량 요청 시 `multiGetObjects` API를 사용하여 쿼리 최적화.
- [ ] Whitelist Export 로직에 에러 바운더리 및 재시도 로직 강화.

---

## 5. 기대 효과
1.  **개발 생산성**: 새로운 관리자 기능 추가 시 기존 훅과 유틸리티를 재사용하여 개발 시간 단축.
2.  **성능 최적화**: React Query의 캐싱 기능을 통해 불필요한 RPC 노드 호출 감소 및 빠른 페이지 전환.
3.  **안정성**: 로직과 UI의 분리로 단위 테스트(Unit Test) 작성이 용이해지며 결함 발생 확률 감소.
