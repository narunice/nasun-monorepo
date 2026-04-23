# Handoff: uju SOL Wallet Adapter + Review Notes Cleanup

**생성**: 2026-04-23
**브랜치**: main
**이전 핸드오프**: 없음 (독립 세션)

## 현재 상태 요약

uju 대시보드에 Phantom/Solflare SOL 지갑 연결 기능을 추가하고, 직전 플랜 리뷰에서 남아있던 Notes/Minor 3건(MissionId sync guard, 장식용 SVG 접근성, opacity-40 토큰 치환) 을 정리. 4개 논리 커밋으로 분리하여 main 에 푸시 완료. Phase 9 본체(온체인 광고 보상 + 앱 등록비 컨트랙트 + SOL 서명) 는 별도 플랜 필요한 상태로 대기.

## 완료된 작업

- [x] Plan 작성 + 독립 리뷰 (Critical 4건, Warning 8건, Note 13건 식별)
- [x] Plan rev 2 로 개정 (satisfies → vitest 교체, 이벤트 구독 v1 제외, UX 단순화)
- [x] Testnet-only invariant 섹션 추가 (devnet/testnet 고정 명시 + 회귀 방어 테스트)
- [x] Part A: `src/lib/solana.ts` (SOL_DEVNET_RPC + SOL_ADDRESS_RE + 하드코드 주석)
- [x] Part A: `src/lib/__tests__/solana.test.ts` (testnet guard: devnet 포함 / mainnet 미포함 검증)
- [x] Part A: `src/types/solana-wallets.d.ts` (declare global 패턴으로 Window 증강)
- [x] Part A: `src/sections/uju/dashboard/useSolanaWalletAdapter.ts` (connect / disconnect, inFlightRef 이중클릭 가드, base58 검증)
- [x] Part A: `WalletBalanceCard.tsx` 통합 (Phantom/Solflare 버튼 + Manual 폴백 + identity 전환 시 wallet mode reset + `uju:sol-wallet:${identityId}` persist)
- [x] Part B: `missionRegistry.test.ts` sync guard 추가 (`satisfies readonly MissionId[]` + `_Exhaustive` 타입으로 양방향 검증, governance-vote 의도 문서화)
- [x] Part C: 11개 장식용 SVG 에 `aria-hidden="true"` 추가 (BannerCarousel 4, AppDirectoryModal 2, UjuDailyMissionsCard 2, NotificationsPanel 3)
- [x] Part C: 완료 원형 체크박스에 `role="img" aria-label="Completed|Incomplete"` 추가
- [x] Part C 드라이브-바이: UjuDailyMissionsCard 외부링크 SVG 의 `opacity-50` → `text-uju-secondary` (opacity-60 이하 금지 규칙 회복)
- [x] Part D: `TotalPointsCard.tsx` 의 `disabled:opacity-40` → `disabled:text-uju-border disabled:hover:text-uju-border`
- [x] 검증: `tsc --noEmit` pass, `vitest src/sections/uju src/lib` 101/101 pass, `vite build` 성공 42.58초, `git diff package.json` 0 diff
- [x] 4 logical commits pushed to origin/main:
  - `d7af2536` feat(uju): add Phantom/Solflare wallet adapter for SOL balance
  - `85fa3ed9` test(uju): enforce MissionId sync with runtime and type guard
  - `e880e99f` chore(uju): mark decorative SVGs aria-hidden and label completion state
  - `edce7298` style(uju): replace disabled:opacity-40 with token-based dim

## 미완료 작업

### 브라우저 실기 검증 (본 세션에서 수행 안 함)

코드 작업은 완료됐으나 Phantom 확장 설치된 실제 브라우저에서의 E2E 테스트 미수행 상태로 main 에 푸시됨. 문제 발견 시 `git revert` 필요.

- [ ] Phantom 설치 브라우저에서 `/uju` → SOL 행 `[Phantom]` 버튼 표시 + 클릭 → approve → 주소 + 잔액 표시
- [ ] Phantom 에서 계정 전환 후 uju 새로고침 → 새 계정 주소 표시(v1 은 이벤트 구독 생략이므로 reload 필요)
- [ ] `[Disconnect]` 클릭 → Phantom disconnect + localStorage 양 키 클리어 + `[Phantom]` 복귀
- [ ] Phantom 팝업 reject 시 "User rejected" 등 walletError 표시
- [ ] Phantom 로그아웃 상태에서 connect → 비밀번호 프롬프트 → UX 확인
- [ ] Phantom 빠른 더블클릭 → 첫 번째만 실행 (inFlightRef 가드 검증)
- [ ] Phantom 미설치 브라우저에서 `[Add]` 수동 입력 폴백 동작
- [ ] DevTools 네트워크 탭으로 mainnet host 0 호출 확인:
  - `api.mainnet-beta.solana.com` / `api.solana.com` 미호출
  - `eth-mainnet.g.alchemy.com` 등 wagmi mainnet transports 미호출
  - `fullnode.mainnet.sui.io` 미호출
- [ ] axe-core DevTools 로 `/uju` 스캔, graphic role 경고 감소 확인

### Phase 9 본체 (별도 플랜 필요)

- [ ] 배너 광고 신호 온체인 기록 + 사용자 보상 자동 지급 (스마트컨트랙트 설계 필요)
- [ ] 앱 등록비 납부 스마트컨트랙트
- [ ] SOL 서명 API (`signMessage` / `signTransaction`) + `accountChanged`/`disconnect` 이벤트 구독 재도입 (tx 안전성 위해)
- [ ] 다중 지갑 확장 (Backpack / Glow) — Wallet Standard registry 마이그레이션 시점

## 중요 컨텍스트

### 결정사항

- **Solana 지갑 어댑터 라이브러리 미설치**: `@solana/wallet-adapter-react` (~180KB) 및 `@wallet-standard/react` (~20KB) 둘 다 기각. `window.phantom.solana` / `window.solflare` 직접 감지(+2KB) 로 95%+ 커버리지 확보. Phase 9 다중 지갑 확장 필요 시 재평가.
- **이벤트 구독 v1 에서 생략**: `accountChanged` / `disconnect` 이벤트 미구독. failure mode 는 "새로고침 1회" 수준이고 tx 안전성 이슈 없음(읽기 전용). Phase 9 서명 도입 시 재추가.
- **MissionId sync guard 를 테스트로 해결**: `as const satisfies readonly UjuMission[]` 은 `UjuMission.id: string` 와이드닝 때문에 무력화되고, readonly tuple 승격이 downstream 에 cascade. 대신 기존 `missionRegistry.test.ts` 에 runtime + type 양방향 describe 블록 추가. production 코드 수정 0.
- **Testnet-only invariant 하드코드**: `SOL_DEVNET_RPC` 를 env 변수로 만들지 않음. .env 실수 편집으로 mainnet 전환될 경로 원천 차단. vitest guard 가 CI 에서 `mainnet-beta` 치환 회귀 방어.
- **UX 단순화**: 지갑 설치됨 브랜치에서 "Manual" 링크 제거. 설치됨 → Connect 버튼만, 미설치 → Add 폴백만. 두 경로 혼재 UX 노이즈 제거.

### 주의사항

- **현재 git working tree 에 uncommitted 변경사항 28개 파일 존재**: pado bots, nasun-website home 섹션, tpsl-keeper 등. **이 변경사항들은 이번 세션과 무관한 pre-existing 작업**. 본 세션은 건드리지 않았음. 이어받는 세션에서 혼동 주의.
- **Phase 9 에서 SOL 서명 추가할 때 testnet invariant 필수 승계**: `signTransaction(tx)` 의 tx 가 devnet RPC 로 구성됐는지 assertion 필요. mainnet 브로드캐스트 경로 도입 금지. 플랜 "Phase 9 연결 지점" 섹션 참조.
- **Phantom/Solflare late injection**: 확장이 `load` 이벤트 이후에 주입되는 드문 케이스는 재감지 안 함. 사용자 새로고침 1회로 복구. Wallet adapter 라이브러리도 동일 이슈.
- **`isPhantom`/`isSolflare` spoof**: Backpack 등이 masquerade 가능. base58 regex 가 1차 방어. 서명 없는 v1 에서는 영향 제한. Phase 9 에서 Wallet Standard registry 로 전환.

### 파일 위치

**신규**:
- `apps/nasun-website/frontend/src/lib/solana.ts` — SOL 상수 + 검증 util
- `apps/nasun-website/frontend/src/lib/__tests__/solana.test.ts` — testnet guard
- `apps/nasun-website/frontend/src/types/solana-wallets.d.ts` — Window 타입 증강
- `apps/nasun-website/frontend/src/sections/uju/dashboard/useSolanaWalletAdapter.ts` — connect/disconnect hook

**수정**:
- `apps/nasun-website/frontend/src/sections/uju/dashboard/WalletBalanceCard.tsx` — SOL 행 통합 + identity reset + wallet mode persist
- `apps/nasun-website/frontend/src/sections/uju/missions/__tests__/missionRegistry.test.ts` — sync guard 확장
- `apps/nasun-website/frontend/src/sections/uju/dashboard/banner/BannerCarousel.tsx` — 4 SVG aria-hidden
- `apps/nasun-website/frontend/src/sections/uju/apps/AppDirectoryModal.tsx` — 2 SVG aria-hidden
- `apps/nasun-website/frontend/src/sections/uju/dashboard/UjuDailyMissionsCard.tsx` — 2 SVG aria-hidden + 완료 원형 role="img" + opacity-50 제거
- `apps/nasun-website/frontend/src/sections/uju/profile/NotificationsPanel.tsx` — 3 SVG aria-hidden
- `apps/nasun-website/frontend/src/sections/uju/dashboard/TotalPointsCard.tsx` — disabled:opacity-40 → disabled:text-uju-border

**플랜 문서**:
- `/home/naru/.claude/plans/sol-adapter-and-review-cleanup.md` — rev 2 (testnet invariant 섹션 포함)

## 최근 변경 파일

본 세션 변경 파일은 모두 4개 커밋으로 포함되어 main 에 푸시됨. 추가 변경 없음.

현재 working tree 의 `M` 목록 28개는 **모두 pre-existing 타 세션 작업**이며 본 세션과 무관:
- apps/pado/bots/*, apps/pado/frontend/*, apps/pado/docs/*
- apps/nasun-website/frontend/src/sections/home/*, src/pages/*, src/features/pado-score-leaderboard/*
- apps/nasun-website/docs/LEADERBOARD_V3_SPEC.md
- packages/tailwind-config/colors.js
- 등

## 즉시 다음 단계

본 세션 스코프 완료. 다음 작업 선택지:

1. **(권장) 브라우저 실기 검증**: 로컬 `pnpm dev:nasun-website` 실행 → Phantom 확장 설치 브라우저에서 /uju 접근 → 미완료 체크리스트 수행. 문제 발견 시 `git revert edce7298..d7af2536^` (4 commits) 후 수정 재푸시
2. **Phase 9 플랜 착수**: 새 플랜 파일 `/home/naru/.claude/plans/phase-9-onchain-rewards.md` 작성 시작. 스마트컨트랙트 설계 + SOL 서명 API + 앱 등록비 컨트랙트 3개 축 정의
3. **Pre-existing 28 파일 정리**: 이번 세션과 무관한 타 세션의 uncommitted 변경사항들 — 각자 해당 세션 컨텍스트에서 처리 필요
