# Handoff: Wallet 패키지 리팩토링 계획

**생성**: 2026-03-10
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

`packages/wallet/`과 `packages/wallet-ui/`를 전수 분석 → 리팩토링 플랜 작성 → 2회 독립 리뷰(3 에이전트 x 2회)를 거쳐 최종 계획 v3가 확정됨. 코드 변경은 아직 없음. 플랜 파일 승인 대기 상태.

## 완료된 작업

- [x] wallet/wallet-ui 코드베이스 전수 분석 (Explore 에이전트)
- [x] 리팩토링 우선순위 도출 (12개 항목)
- [x] 1차 리뷰 (3 에이전트 병렬): 수치 오류, 과잉 진단, 보안 누락 식별
- [x] 실측 검증: auto-lock 중복 확인, shortenAddress 14개 정의 매핑, SendTransaction 690 LOC 구조 파악
- [x] 2차 리뷰 (3 에이전트 병렬): 과잉 추상화 경고, Step 축소/제거 확정
- [x] 최종 계획 v3 작성

## 미완료 작업

- [ ] 플랜 승인 (ExitPlanMode)
- [ ] Step 1: passkeyStore auto-lock 결함 수정 (cleanup 함수 추가, 설정 변경 감지)
- [ ] Step 2: shortenAddress 패키지 내부 2곳 중복 제거 (decoder.ts, SessionKeyPanel.tsx)
- [ ] Step 3: README localStorage 키 불일치 수정

## 중요 컨텍스트

### 결정사항

1. **auto-lock 공유 모듈 생성 안 함**: 두 구현(useWallet.ts, passkeyStore.ts)의 차이가 본질적(설정 읽기 방식, lock 메서드, 초기화 시점). 공유 모듈은 콜백 보일러플레이트만 추가. passkeyStore 내부 ~10줄 수정으로 동일한 문제 해결.

2. **SIGNER_PRIORITY 상수화 안 함**: 현재 6줄 if-else가 명확하고 보안 크리티컬 경로. 미학적 변경에 리그레션 위험 불필요.

3. **SendTransaction 분리 안 함**: 690 LOC이지만 `if (condition) return (...)` 패턴으로 잘 구조화됨. ConfirmView 추출 시 25+ props 필요하여 오히려 악화.

4. **STORAGE_KEYS 중앙 파일 안 만듦**: 각 모듈이 이미 `const XXX_KEY = '...'`로 상수화됨. 중앙 파일은 의존성 역전.

5. **shortenAddress 앱 10곳은 점진적 교체**: 해당 파일 수정 시 함께 교체. 일괄 교체는 리뷰/테스트 부담 과다.

### 주의사항

- passkeyStore의 auto-lock은 **모듈 로드 시 즉시 실행** (top-level call). 이 동작 보존 필요.
- useWallet.ts의 module-level `currentKeypair`는 **보안 설계** (직렬화 방지). 리팩토링 대상이 아님.
- `shortenAddress` canonical 구현에 짧은 문자열 가드 없음 (`"0x1"` → `"0x1...1"`). 선택적 개선.
- README의 `nasun_security_settings` ≠ 실제 코드의 `nasun_wallet_security`. 키 이름 변경 금지 (사용자 데이터 유실).

### 핵심 파일 경로

| 파일 | 역할 |
|------|------|
| `packages/wallet/src/stores/passkeyStore.ts` | Step 1 수정 대상 (L83-127 auto-lock) |
| `packages/wallet/src/hooks/useWallet.ts` | auto-lock 정규 구현 참조 (L402-456) |
| `packages/wallet/src/core/clear-signing/decoder.ts` | Step 2 수정 대상 (L770 shortenAddress) |
| `packages/wallet-ui/src/advanced/SessionKeyPanel.tsx` | Step 2 수정 대상 (L51 shortenAddress) |
| `packages/wallet/src/sui/client.ts` | shortenAddress canonical (L303) |
| `packages/wallet/src/__tests__/passkeyAutoLock.test.ts` | Step 1 검증용 테스트 (291줄) |

### 플랜 파일 위치

`~/.claude/plans/mellow-waddling-sprout.md` — 최종 v3

## 최근 변경 파일

워킹 트리에 leaderboard-v3 관련 미커밋 변경이 있으나 이 리팩토링과 무관:
- `apps/nasun-website/cdk/lambda-src/leaderboard-v3/` (create-post, types)
- `apps/nasun-website/frontend/src/features/admin/` (PostRegistrationTab, hooks, services, types)

## 즉시 다음 단계

1. 플랜 파일 승인 (`ExitPlanMode`)
2. `packages/wallet/src/stores/passkeyStore.ts` 읽기 → cleanup 함수 추가 + 설정 변경 감지 추가
3. `pnpm build` 검증
4. `packages/wallet/src/core/clear-signing/decoder.ts`의 shortenAddress를 내부 import로 교체
5. `packages/wallet-ui/src/advanced/SessionKeyPanel.tsx`의 shortenAddress를 `@nasun/wallet` import로 교체
6. `pnpm build` 검증
