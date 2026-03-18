# Handoff: 거버넌스 다지선다(Multi-Choice) 투표 추가

**생성**: 2026-03-18 01:40
**브랜치**: main (새 feature 브랜치 필요)
**이전 핸드오프**: 없음

## 현재 상태 요약

거버넌스 다지선다 투표 기능의 설계와 3-에이전트 리뷰가 완료되었다. 최종 플랜이 확정되어 `/home/naru/.claude/plans/precious-forging-muffin.md`에 저장되어 있다. 아직 코드 구현은 시작하지 않았다.

## 완료된 작업

- [x] 현재 거버넌스 투표 시스템 전체 분석 (Move 컨트랙트 + Lambda API + 프론트엔드)
- [x] 다지선다 투표 구현 설계 (새 Move 모듈 접근법)
- [x] 3-에이전트 병렬 리뷰 (실현가능성, 아키텍처, 대안)
- [x] Critical 이슈 3건 식별 및 플랜 반영
- [x] MVP 범위 결정: 단일선택만, 복수선택은 추후
- [x] 투표 가중치: 제안 생성 시 관리자가 1인1표/가중치 선택

## 미완료 작업

- [ ] Step 1: Move 컨트랙트 `multi_choice_proposal.move` 작성
- [ ] Step 2: Dashboard 연동 확인
- [ ] Step 3: Lambda API `validateTxKind()` 리팩토링
- [ ] Step 4-10: 프론트엔드 구현 (타입, VoteModal, ProposalItem, CreateProposal, hooks 등)
- [ ] Step 11: 컨트랙트 빌드/테스트/배포

## 중요 컨텍스트

### 결정사항

1. **새 Move 모듈 생성** (기존 Proposal struct 수정 불가 - Move 제약)
2. **별도 `MultiChoiceProposalStatus` enum** - 기존 ProposalStatus variant를 다른 모듈에서 생성하는 것이 불확실
3. **VoteProofNFT MVP 생략** - voters Table 직접 조회로 투표 여부 판별
4. **Certificate 시스템 100% 재활용** - `voting_power::consume_certificate()` (public(package))
5. **`use_equal_weight: bool`** - true이면 certificate의 voting_power 무시, 1로 고정

### 리뷰에서 발견된 Critical 이슈 (플랜에 반영 완료)

1. **ProposalStatus enum 재활용 불가** -> 별도 enum 정의
2. **Lambda `validateTxKind()` 하드코딩** -> 단순 ALLOWED_TARGETS 추가가 아니라 expectedFunctions, extractProposalIdFromTx 로직도 수정 필요
3. **프론트엔드 proposal 파싱** -> `content.type` 기반 discriminator + 별도 `parseMultiChoiceProposal()` 필수

### 주의사항

- Move 패키지 업그레이드: 새 모듈 추가는 compatible upgrade에 해당 (OK)
- 기존 모듈의 public 함수 시그니처 변경은 불가
- 선택지 텍스트 길이 제한 필요 (MAX_CHOICE_BYTES: 200)
- 중복 인덱스 검증: 오름차순 정렬 요구 후 인접 비교 O(n) 방식 권장
- ProposalTypeRegistry에 MultiChoice proposal도 등록 필요 (sponsor 여부 판별용)

### 파일 위치

- **플랜**: `/home/naru/.claude/plans/precious-forging-muffin.md`
- **기존 Move 컨트랙트**: `apps/nasun-website/contracts/governance/sources/`
  - `proposal.move` - 기존 Yes/No 투표 (참조 패턴)
  - `voting_power.move` - Certificate 시스템 (consume_certificate 재활용)
  - `dashboard.move` - Dashboard + AdminCap
- **Lambda API**: `apps/nasun-website/cdk/lambda-src/governance-api/src/index.ts`
- **프론트엔드 거버넌스**: `apps/nasun-website/frontend/src/features/governance/`
- **관리자 CreateProposal**: `apps/nasun-website/frontend/src/features/admin/pages/CreateProposal.tsx`

## 최근 변경 파일

현재 working tree의 변경사항은 이 작업과 무관함 (별도 진행 중인 whitelist/NFT 관련 작업):
- `apps/nasun-website/cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts`
- `apps/nasun-website/cdk/lib/admin-stack.ts`
- `apps/nasun-website/frontend/src/features/admin/pages/WhitelistManagement.tsx`
- `apps/nasun-website/frontend/src/features/admin/services/adminApi.ts`
- `apps/nasun-website/frontend/src/features/admin/types/index.ts`
- `apps/nasun-website/frontend/src/sections/myAccount/CompactNftStatus.tsx`

## 즉시 다음 단계

1. 새 feature 브랜치 생성 (`feat/governance-multi-choice`)
2. 플랜 파일 읽기: `~/.claude/plans/precious-forging-muffin.md`
3. Step 1부터 시작: `multi_choice_proposal.move` 작성
4. Move 빌드/테스트 통과 확인 후 Lambda -> 프론트엔드 순서로 진행