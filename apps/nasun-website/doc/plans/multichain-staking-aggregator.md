# Plan: uju 대시보드 멀티체인 staking portfolio aggregator (read-only) — v5

## Context

uju 대시보드에서 SUI/ETH/SOL staking 현황을 통합 표시하고 싶음. 현재 SuiStakeModal에서 zkLogin 사용자가 epoch 불일치로 차단되는 critical bug가 있고 (`ZKLogin expired at epoch 1029, current epoch 1083`), zkLogin proof는 발급 네트워크 epoch에 묶여 외부 체인에서 본질적으로 거부됨.

이전 plan(@nasun/wallet 멀티체인 signing 고도화)은 wallet-ui external trigger API 부재, hook 4개 원자성, 멀티체인 signer 인프라 거대화 등 prototype 범위 초과로 폐기.

**채택 방향**: portfolio aggregator. 사용자는 자기 외부 ETH/SOL/SUI 지갑을 nasun identity에 등록만 하고, 실제 staking은 canonical 사이트(Lido / Marinade / Sui Wallet 또는 suiscan)에서 수행. uju는 모든 체인의 staking 포지션을 read-only로 통합 표시 + canonical 사이트로 deep link. NSN은 우리가 통제하는 체인이라 native staking 그대로 유지.

## 정책: read-only mainnet OK, write/tx mainnet 영구 금지

- **Read (RPC 조회)**: mainnet 허용. LST 잔액, stake account, validator 정보 등은 mainnet에서만 의미.
- **Write (서명/트랜잭션)**: mainnet 영구 금지. uju는 외부 체인에 서명하지 않으며, 미래 추가하더라도 testnet/devnet 한정.

## v5 변경사항 (4 Critical 반영)

- **Critical #1 wstETH 누락**: Phase 2C에 wstETH 동시 표시 + `stEthPerToken()` ratio로 ETH 환산
- **Critical #2 WalletBalanceCard SOL state owner 미정**: Phase 3A.2에 5개 state 매핑 표 + sync useEffect 명시
- **Critical #3 store hook signature**: Phase 3A.1에 identityId-keyed shape + undefined 정책 + react-query `enabled` flag
- **Critical #4 import-graph guard**: vitest fs/glob → **ESLint zone (`import/no-restricted-paths`)**으로 대체. vitest test는 단순 string-match만 유지.

## Recommended Approach

이번 세션에 Phase 0 + 1 + 2 + 3 모두 진행. Phase 1 (SUI)는 zkLogin epoch error를 즉시 해결하는 launch-blocker. Phase 2/3은 사용자 명시 요구.

### Phase 0: 공통 인프라

#### 0A. Mainnet read-only RPC 분리 + Connection factory
- 기존 [src/lib/solana.ts](apps/nasun-website/frontend/src/lib/solana.ts) **그대로 둠** (testnet-only invariant + 기존 regression test 유지)
- 신규 [src/lib/solana-readonly.ts](apps/nasun-website/frontend/src/lib/solana-readonly.ts):
  ```ts
  import { Connection } from '@solana/web3.js';

  // READ-ONLY INVARIANT: This module exposes Solana mainnet RPC for QUERY ONLY.
  // Enforced by naming convention (`_READ_` infix) + code review + vitest
  // host-match assertion (see __tests__/solana-readonly.test.ts).
  // Tx signing must use SOL_DEVNET_RPC from solana.ts. Adding sendTransaction
  // calls here is a code review hard-block.
  export const SOL_MAINNET_READ_RPC = 'https://solana-rpc.publicnode.com';

  // Singleton via lazy factory — easier to mock in tests (vi.mock the module
  // and override getSolReadConnection). Hooks import the accessor, never
  // construct Connection themselves.
  let _conn: Connection | null = null;
  export function getSolReadConnection(): Connection {
    if (!_conn) _conn = new Connection(SOL_MAINNET_READ_RPC, 'confirmed');
    return _conn;
  }
  ```
- 신규 test [src/lib/__tests__/solana-readonly.test.ts](apps/nasun-website/frontend/src/lib/__tests__/solana-readonly.test.ts): 단순 string-match만
  - `SOL_MAINNET_READ_RPC`가 mainnet 호스트 매치 (e.g. `not.toContain('devnet')` + `toContain('mainnet')` or `toContain('publicnode')`)
  - 추가 가드 불필요 (Critical #4 결정 참조)
- RPC 결정: PublicNode 단독 (`solana-rpc.publicnode.com`, $0, no key). Helius drop.

#### 0B. import-graph guard 정책 결정 (Critical #4 review 후 재결정)

ESLint zone 도입은 prototype 단계에 운영 부담 (plugin 추가, flat config 갱신, 향후 sol devnet signing 충돌 시 overrides 작성). v5 review에서 alternatives + feasibility 모두 단순화 권장.

**채택**: ESLint config 변경 **안 함**. 단순 vitest string-match (0A) + naming convention (`_READ_RPC` 접미사) + 코드 리뷰로 회귀 차단. 향후 transaction signing 코드가 실수로 `SOL_MAINNET_READ_RPC`를 import하면 PR review에서 catch (`sendTransaction` 라인이 명시적이라 review 시 명백).

향후 sol devnet signing (Phase 9) 도입 시점에 ESLint zone 재검토 — 그 시점엔 testnet/devnet 분기가 명확해져 zone 정의도 깔끔.

### Phase 1: SUI Testnet — read-only 포지션 모달 (clean rewrite)

#### 1A. SuiStakingPositionsModal **clean rewrite** (신규 파일 + 기존 삭제, commit 분리)
- 기존 [SuiStakeModal.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sui/SuiStakeModal.tsx) 470줄 → 새 파일 ~150줄. PR diff 명확.
- 신규 [SuiStakingPositionsModal.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sui/SuiStakingPositionsModal.tsx):
  - 보존 동작: 잔액, faucet 링크, stake 리스트 (validator 이름)
  - 제거: step 머신, validator 선택, amount 입력, transaction 제출, result step, ZkLoginNotice
  - "New Stake" → "Manage on Sui ↗" 외부 링크 (suiscan testnet validators)
  - 행별 "Unstake" → "View on SuiVision ↗" 외부 링크 (`stakedSuiId`)
- 기존 SuiStakeModal.tsx 삭제 (별도 commit)

#### 1B. 트랜잭션 hook + 사용 안 하는 상수 삭제
순서 (`tsc --noEmit`이 진짜 gate):
1. [useSuiTestnetStakeTransaction.ts](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sui/useSuiTestnetStakeTransaction.ts) 삭제
2. `pnpm --filter @nasun/nasun-website exec tsc --noEmit` 에러 0건
3. [suiTestnet.ts](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sui/suiTestnet.ts)에서 `MIN_STAKE_MIST` / `MIN_STAKE_SUI` / `parseSuiAmount` / `SUI_TESTNET_EXPLORER_TX` 제거
4. `tsc --noEmit` 재확인
5. [useSuiTestnetStaking.ts](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sui/useSuiTestnetStaking.ts)는 read-only로 그대로 사용

#### 1C. 표시 SUI 주소 selector
1. `useUjuWalletRegistration().registeredWallets` 중 SUI-shape (`^0x[a-fA-F0-9]{64}$`) 첫 번째 (`registeredAt` ASC)
2. 위 없고 활성 chain이 Sui scheme일 때만 `useSigner().address`. EVM 활성이면 LocalSigner unregister 상태 → step 3 즉시
3. 둘 다 없으면 미등록 (CTA)

multi-registered 시 모달 헤더에 "Showing: 0xab...cd" 표시.

#### 1D. StakingCard SUI 행
- 미등록 → "Connect Sui address" CTA → `registerCurrentWallet()`. `!hasSigner`면 disable + tooltip
- stakes > 0 → "X.XX SUI" + "View" 버튼 (모달)
- stakes = 0 → "Stake on Sui ↗" 직접 외부 링크

#### 1E. registerCurrentWallet 실패 처리
- `useUjuWalletRegistration.error`를 inline error + Retry
- 기존 callsite 패턴: `setError(e.message) + finally`. error를 state로만 노출 (rethrow 안 함). 동일 패턴 사용.
- error code → 사용자 친화 메시지 mapper 추가 (zkLogin internal error → "Wallet signing failed").

### Phase 2: ETH Liquid Staking 표시 (Mainnet read-only, stETH + wstETH)

#### 2A. ETH 주소 source
- `linkedAccounts.metamask.walletAddress` ([userStore.ts:46](apps/nasun-website/frontend/src/store/userStore.ts#L46))
- `verifySignature` ecrecover로 강한 proof-of-ownership 보유
- 미등록 → "Connect MetaMask" CTA. **inline 모달 권장** (대시보드 안에서 처리, my-account 페이지 navigate는 컨텍스트 손실). fallback to navigate.

#### 2B. wagmi mainnet 설정 (이미 검증됨)
- [wagmiConfig.ts:32, 57-63](apps/nasun-website/frontend/src/config/wagmiConfig.ts#L32) mainnet chain + transports + Alchemy fallback. 변경 불필요.
- multicall3 mainnet 자동 batch.

#### 2C. stETH + wstETH balance 조회 (Critical #1, #2 반영)
파일: 신규 [staking/eth/useEthLst.ts](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/eth/useEthLst.ts)

**환산 헬퍼 (별도 export)**:
```ts
// wstETH는 non-rebasing. ratio (1e18-scaled stETH per wstETH)로 stETH 환산.
// e.g. ratio = 1180000000000000000n → 1 wstETH ≈ 1.18 stETH
export function wstethToSteth(wstethBal: bigint, ratio: bigint): bigint {
  return (wstethBal * ratio) / 10_000_000_000_000_000_00n; // 1e18
}
```

**hook**:
```ts
import { mainnet } from 'wagmi/chains';
import { useReadContracts } from 'wagmi';
import { erc20Abi, parseAbi, formatUnits } from 'viem';

const STETH  = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as const; // stETH (rebasing)
const WSTETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0' as const; // wstETH (wrapped, non-rebasing)
const WSTETH_ABI = parseAbi(['function stEthPerToken() view returns (uint256)']);

export interface EthLstView {
  stethBal: bigint;        // raw stETH balanceOf (rebasing → 시시각각 변동)
  wstethBal: bigint;       // raw wstETH balanceOf (고정)
  stethFromWsteth: bigint; // wstETH 환산 stETH
  totalSteth: bigint;      // stethBal + stethFromWsteth (단일 표시값)
}

export function useEthLst(user: `0x${string}` | undefined) {
  // Balances: 60s/120s (잔액 변동 frequent)
  const balances = useReadContracts({
    contracts: user ? [
      { address: STETH,  abi: erc20Abi, functionName: 'balanceOf', args: [user], chainId: mainnet.id },
      { address: WSTETH, abi: erc20Abi, functionName: 'balanceOf', args: [user], chainId: mainnet.id },
    ] : [],
    query: {
      enabled: !!user,
      staleTime: 60_000,
      refetchInterval: 120_000,
      retry: 2,
      retryDelay: (i: number) => Math.min(1000 * 2 ** i, 30_000),
    },
  });

  // Ratio: 1h staleTime (Lido oracle ~daily rebase, ratio drift per minute negligible)
  // W1 review 반영 — multicall 대역폭 절약
  const ratio = useReadContracts({
    contracts: [{ address: WSTETH, abi: WSTETH_ABI, functionName: 'stEthPerToken', chainId: mainnet.id }],
    query: { staleTime: 3_600_000, refetchInterval: 3_600_000, retry: 2 },
  });

  // Compose: 환산 + total
  const view: EthLstView | null = (() => {
    if (!balances.data || !ratio.data) return null;
    const stethBal = (balances.data[0]?.result ?? 0n) as bigint;
    const wstethBal = (balances.data[1]?.result ?? 0n) as bigint;
    const r = (ratio.data[0]?.result ?? 0n) as bigint;
    const stethFromWsteth = r > 0n ? wstethToSteth(wstethBal, r) : 0n;
    return {
      stethBal,
      wstethBal,
      stethFromWsteth,
      totalSteth: stethBal + stethFromWsteth,
    };
  })();

  return {
    view,
    isLoading: balances.isLoading || ratio.isLoading,
    isError: balances.isError || ratio.isError,
  };
}

// 표시 helper (형식: "≈ 1.2345 stETH")
export function formatEthLstDisplay(v: EthLstView): string {
  if (v.totalSteth === 0n) return '0 stETH';
  const sFmt = formatUnits(v.totalSteth, 18);
  const truncated = truncateDecimals(sFmt, 4); // round 아닌 truncate
  return `≈ ${truncated} stETH`;
}
function truncateDecimals(s: string, n: number): string {
  const [int, frac = ''] = s.split('.');
  return frac ? `${int}.${frac.slice(0, n).replace(/0+$/, '') || '0'}` : int;
}
```
표시 단순화 (review N7): 사용자에게는 합산 stETH 환산값 1줄. 호버 또는 details disclosure로 stETH/wstETH breakdown 노출 가능 (구현 시 결정).

#### 2D. ETH 행 갱신 (inline)
- 미등록 → "Connect MetaMask" CTA + "Stake on Lido ↗"
- 등록 + balance 0 → "Stake on Lido ↗" 직접 링크
- 등록 + 잔액 있음 → "≈ X.XXXX stETH (Y.YYYY wstETH ≈ Z.ZZ stETH)" inline. truncate 4자리, "≈" prefix로 rebasing 표시.
- "Manage on Lido ↗" 외부 링크 유지
- `ETH_LIDO_APY_DISPLAY = "~3.8%"` 하드코딩 제거
- RPC error UI: `isError && !data` → "RPC unavailable, retry" 버튼. `isError && data` → stale + 작은 stale 인디케이터.
- 신규 unit test: STETH/WSTETH 주소 frozen snapshot (`expect(STETH).toBe('0xae7a...84')` literal, `toMatchSnapshot` 안 씀)

EthLstPositionsModal 신규 파일 만들지 않음 (1~2개 row inline).

### Phase 3: SOL 표시 (Mainnet read-only, LST 3개)

#### 3A. SOL 주소 source — store 마이그레이션 (split)

##### 3A.1: Zustand store 신규 — hook signature 명시 (Critical #3)
신규 [stores/solAddressStore.ts](apps/nasun-website/frontend/src/sections/uju/stores/solAddressStore.ts):
```ts
import { create } from 'zustand';
import { isValidSolAddress } from '@/lib/solana';

interface IdentitySolState {
  solAddress: string | null;
  connectedWallet: 'phantom' | 'solflare' | null;
}

interface SolAddressStore {
  byIdentity: Record<string, IdentitySolState>;
  setForIdentity: (identityId: string, addr: string | null, wallet: 'phantom' | 'solflare' | null) => void;
  hydrateFromStorage: (identityId: string) => void; // localStorage → store
}

export const useSolAddressStore = create<SolAddressStore>((set) => ({
  byIdentity: {},
  setForIdentity: (identityId, addr, wallet) => {
    if (addr && !isValidSolAddress(addr)) {
      throw new Error('Invalid Solana address'); // store level 검증 강제
    }
    // localStorage 동기화
    if (addr) {
      localStorage.setItem(`uju:sol-address:${identityId}`, addr);
      if (wallet) localStorage.setItem(`uju:sol-wallet:${identityId}`, wallet);
    } else {
      localStorage.removeItem(`uju:sol-address:${identityId}`);
      localStorage.removeItem(`uju:sol-wallet:${identityId}`);
    }
    set((s) => ({
      byIdentity: { ...s.byIdentity, [identityId]: { solAddress: addr, connectedWallet: wallet } },
    }));
  },
  hydrateFromStorage: (identityId) => {
    const addr = localStorage.getItem(`uju:sol-address:${identityId}`);
    const w = localStorage.getItem(`uju:sol-wallet:${identityId}`);
    if (addr && isValidSolAddress(addr)) {
      set((s) => ({
        byIdentity: { ...s.byIdentity, [identityId]: {
          solAddress: addr,
          connectedWallet: (w === 'phantom' || w === 'solflare') ? w : null,
        }},
      }));
    }
  },
}));

// Selector hook — undefined identityId 시 null 반환 (throw 안 함)
export function useSolAddressForIdentity(identityId: string | undefined) {
  return useSolAddressStore(s => identityId ? (s.byIdentity[identityId] ?? null) : null);
}
```

**hook 사용 패턴**:
```ts
const sol = useSolAddressForIdentity(user?.identityId);
// sol === null → 미등록 또는 identityId undefined (transition 중)
// sol === { solAddress: '...', connectedWallet: 'phantom' } → 등록됨
```

##### 3A.2: 컴포넌트 마이그레이션 — 5 state owner 표 (Critical #2)

WalletBalanceCard의 5개 SOL state 명시 매핑:

| State | Owner | 이유 |
|---|---|---|
| `solAddress` | **store** | StakingCard도 구독 |
| `connectedWallet` | **store** | adapter 종류 다른 컴포넌트가 알아야 함 |
| `solInput` | **컴포넌트 local** | 편집 input buffer, 단일 컴포넌트 사용 |
| `solError` | **컴포넌트 local** | input form UI state |
| `solEditing` | **컴포넌트 local** | 편집 모드 토글, UI 전용 |

**Sync useEffect 명시** (store → 컴포넌트 input 일방향 동기화):
```ts
// WalletBalanceCard 안
const { user } = useAuth();
const sol = useSolAddressForIdentity(user?.identityId);

// identityId 변경 시 hydrate
useEffect(() => {
  if (user?.identityId) {
    useSolAddressStore.getState().hydrateFromStorage(user.identityId);
  }
}, [user?.identityId]);

// store solAddress 변경 → input buffer 동기화 (편집 중이 아닐 때만)
useEffect(() => {
  if (!solEditing) {
    setSolInput(sol?.solAddress ?? '');
  }
}, [sol?.solAddress, solEditing]);
```

StakingCard도 같은 hook 구독 → SOL 주소 변경 즉시 반영.

##### 3A.3: 검증 시나리오
- 시나리오 1: Phantom connect → solAddress 표시 → disconnect → null
- 시나리오 2: manual 입력 (invalid) → store reject + error
- 시나리오 3: manual 입력 (valid) → 저장 → 새로고침 → hydrate로 복원
- 시나리오 4: identityId 전환 → 새 주소 로드 (이전 identityId state는 보존)
- 시나리오 5: WalletBalanceCard 변경 → StakingCard 즉시 반영
- 시나리오 6: 빈 입력 → null로 clear
- 시나리오 7: identityId flicker (`undefined → string`) → `useSolAddressForIdentity` null 반환, RPC fetch 안 됨 (`enabled: false`)

#### 3B. ownership 정책 (self-display 한정)
- Phantom/Solflare adapter는 `signMessage` 호출 안 함 ([useSolanaWalletAdapter.ts:42-69](apps/nasun-website/frontend/src/sections/uju/dashboard/useSolanaWalletAdapter.ts#L42)). 코드 주석에 명시: "Phase 9 will add signMessage; current ownership unverified."
- Manual entry도 base58 형식만 검증
- self-display 한정. 서버에 저장 안 함 (localStorage only). ecosystem points 등 권한 부여에 SOL 주소 사용 금지.
- StakingCard SOL 행에 작은 "address not verified" 배지

#### 3C. SOL LST balance 조회
파일: 신규 [staking/sol/useSolLst.ts](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sol/useSolLst.ts)
```ts
import { solReadConnection } from '@/lib/solana-readonly'; // singleton (Phase 0A)
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

const LSTS = [
  { symbol: 'mSOL',    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So' },
  { symbol: 'jitoSOL', mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn' },
  { symbol: 'bSOL',    mint: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1' },
] as const;

export function useSolLst(solAddress: string | null) {
  return useQuery({
    queryKey: ['sol-lst', solAddress],
    enabled: !!solAddress, // null/undefined 시 fetch 안 함 (Critical #3)
    queryFn: async () => {
      const owner = new PublicKey(solAddress!);
      const { value } = await solReadConnection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
      });
      // LST mint 필터링 + uiAmount 추출
      return LSTS.map((lst) => {
        const acc = value.find(v => v.account.data.parsed.info.mint === lst.mint);
        return { symbol: lst.symbol, uiAmount: acc?.account.data.parsed.info.tokenAmount.uiAmount ?? 0 };
      });
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 30_000),
  });
}
```
- 신규 unit test: 3 mint 주소 frozen snapshot (literal `toBe`)
- native stake 조회 안 함. 사용자 native staker는 외부 사이트 (`https://stakeview.app/<address>`) 직접 링크

#### 3D. SOL 행 갱신 (inline) + Connect 모달 정책 (Critical #4)

**SOL "Connect Solana wallet" CTA = inline 모달**:
- 신규 [staking/sol/SolConnectModal.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sol/SolConnectModal.tsx) — 작은 모달 컴포넌트
- WalletBalanceCard의 manual-entry form + Phantom/Solflare adapter 버튼을 **공유 inline form 컴포넌트**로 추출 후 두 곳에서 재사용:
  - 신규 [staking/sol/SolAddressInput.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sol/SolAddressInput.tsx)
  - WalletBalanceCard도 이 컴포넌트로 리팩토링 (form UI 단일 source)
- 같은 store action (`setForIdentity`)을 호출 → WalletBalanceCard와 StakingCard에 즉시 반영
- 모달 닫기 시 store 변경 사항만 보존, 미저장 input은 폐기

**SOL Address input UX (Critical #5 반영)**:
- input placeholder/helper text: `"Press Enter to save · Esc to cancel"` (사용자에게 명시)
- onKeyDown: Enter → 검증 후 store 저장 (현 동작 유지)
- onBlur 시:
  - input이 valid base58 + 현재 store solAddress와 다름 → **auto-save** (silent save)
  - input이 invalid → toast 또는 inline error: "Address not saved" (data loss 방지)
  - input이 비어 있고 store에 주소 있음 → no-op (clear는 명시 액션 요구)
- onKeyDown Esc → 편집 취소, store 값으로 input 복원

**기존 SOL row 표시**:
- 미등록 → "Connect Solana wallet" CTA (모달 트리거) + "Stake on Marinade ↗"
- 등록 + 모든 LST 0 → "Stake on Marinade ↗" 직접 링크
- 등록 + LST > 0 → 표시 정책:
  - **wrap 정책**: balance > 0인 LST만 표시. 0인 것은 숨김 (W8 반영)
  - 형식: "0.5 mSOL · 0.3 jitoSOL" 등 inline horizontal (1줄)
  - "Manage" 버튼 → **inline horizontal links** (Marinade / Jito / Sanctum) — dropdown 안 씀 (W9 반영, shadcn DropdownMenu 의존성 회피)
- "address not verified" 배지 항상 노출
- RPC error UI: ETH와 동일 패턴

SolStakePositionsModal 신규 파일 만들지 않음.

### WalletBalanceCard ↔ StakingCard 분리 결정

두 카드 의도적 분리:
- **WalletBalanceCard**: chain별 **liquid balance**
- **StakingCard**: chain별 **staked positions**

같은 chain 주소가 두 카드에 보이지만 표시 데이터가 다름. 통합 `<PortfolioCard>`는 future Issue.

### 미래 작업 (작업 시점에 GitHub Issues 생성, plan 파일이 canonical reference)

PR 머지 시 Issue 일괄 등록 안 함 — 작업 시점에 `gh issue create` (운영 부담 경감). plan 파일은 PR open 시 [apps/nasun-website/doc/plans/multichain-staking-aggregator.md](apps/nasun-website/doc/plans/multichain-staking-aggregator.md)로 복사 (canonical reference). `~/.claude/plans/` 원본은 PR open 후 obsolete.

미래 항목:
- ETH rETH/cbETH 추가 (demand 신호 후)
- SOL native stake account 표시 (PublicNode `getProgramAccounts` 실측 후)
- 외부 SUI 지갑 typed entry (ownership 미검증, "unverified" 배지)
- WalletBalanceCard ↔ StakingCard 통합
- Live APY fetch (Lido/Marinade)
- Deep link referral param (`URL.searchParams.set`)
- 나선 지갑 mnemonic에서 SOL/ETH 주소 도출 + native multi-chain signing
- 외부 chain stake → ecosystem points 적립
- Phantom signMessage 도입 (SOL ownership 검증)
- Multi-tab localStorage sync (`storage` event listener)

## 핵심 수정/신규 파일

### 변경
- [staking/sui/SuiStakeModal.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sui/SuiStakeModal.tsx) **삭제** (Phase 1A clean rewrite)
- [staking/sui/suiTestnet.ts](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sui/suiTestnet.ts) (parser/MIN_STAKE/EXPLORER_TX 제거)
- [StakingCard.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/StakingCard.tsx) (SUI/ETH/SOL 행 갱신, ETH APY 제거)
- [WalletBalanceCard.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/WalletBalanceCard.tsx) (SOL state 마이그레이션)

### 삭제
- [staking/sui/useSuiTestnetStakeTransaction.ts](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sui/useSuiTestnetStakeTransaction.ts)

### 신규
- [staking/sui/SuiStakingPositionsModal.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sui/SuiStakingPositionsModal.tsx) (clean rewrite)
- [src/lib/solana-readonly.ts](apps/nasun-website/frontend/src/lib/solana-readonly.ts) (`SOL_MAINNET_READ_RPC` + `getSolReadConnection()` factory)
- [src/lib/__tests__/solana-readonly.test.ts](apps/nasun-website/frontend/src/lib/__tests__/solana-readonly.test.ts) (단순 string-match)
- [staking/eth/useEthLst.ts](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/eth/useEthLst.ts) + 단위 test (frozen address + `wstethToSteth` 환산 unit test)
- [staking/sol/useSolLst.ts](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sol/useSolLst.ts) + 단위 test
- [staking/sol/SolAddressInput.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sol/SolAddressInput.tsx) (공유 form, WalletBalanceCard에서도 사용)
- [staking/sol/SolConnectModal.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/staking/sol/SolConnectModal.tsx) (StakingCard CTA 트리거)
- [stores/solAddressStore.ts](apps/nasun-website/frontend/src/sections/uju/stores/solAddressStore.ts)

### 변경 안 함
- [src/lib/solana.ts](apps/nasun-website/frontend/src/lib/solana.ts) (testnet-only invariant 유지)
- [src/lib/__tests__/solana.test.ts](apps/nasun-website/frontend/src/lib/__tests__/solana.test.ts)
- [packages/wallet/*](packages/wallet/) (NSN native staking 회귀 방지)
- pado/network-explorer staking 흐름

## 재사용할 기존 함수/패턴

- [getMoveClient(rpcUrl, chainId)](packages/wallet/src/sui/client.ts#L193) — Sui Testnet 쿼리
- [useUjuWalletRegistration](apps/nasun-website/frontend/src/sections/uju/hooks/useUjuWalletRegistration.ts) — SUI 주소 등록 (challenge-response)
- [linkedAccounts.metamask.walletAddress](apps/nasun-website/frontend/src/store/userStore.ts#L46) — ETH 주소 (ecrecover proof-of-ownership)
- [WalletBalanceCard SOL adapter/manual 흐름](apps/nasun-website/frontend/src/sections/uju/dashboard/WalletBalanceCard.tsx#L95) — store로 결과 mirror
- [isValidSolAddress](apps/nasun-website/frontend/src/lib/solana.ts) — store 검증
- 외부 링크 상수 (`SUI_VALIDATORS_URL`, `LIDO_STAKING_URL`, `MARINADE_STAKING_URL`)

## Verification

### 타입/단위 검증
1. `pnpm --filter @nasun/nasun-website exec tsc --noEmit` — Phase 1B 후 + 마지막
2. `pnpm --filter @nasun/nasun-website test` — solana.test.ts (testnet) + solana-readonly.test.ts (mainnet host) + ETH/SOL LST address frozen snapshot 통과
3. `pnpm dev:nasun-website` 개발 서버 (ESLint zone 보류, lint 단계 추가 안 함)

### 시나리오 1: zkLogin 사용자 (이전 epoch error 경로 해소)
- Google/Twitter zkLogin 로그인 → 우주 대시보드 → SUI 행
- 등록된 SUI 주소 있으면 stake 합계 + "View" → 모달 정상 열림
- "Manage on Sui ↗" → suiscan testnet validators 새 탭
- 에러 없음 (이전 zkLogin epoch error 사라짐)
- SuiStakingPositionsModal import 단일 site (StakingCard.tsx) 확인

### 시나리오 2: nasun mnemonic 사용자
- 동일 흐름 정상

### 시나리오 3: 미등록 SUI
- "Connect Sui address" CTA → `registerCurrentWallet()` → 모달 positions view
- 등록 실패 → inline error + Retry, 사용자 친화 메시지

### 시나리오 4: ETH stETH + wstETH 표시
- MetaMask 연결된 사용자 → 본인 주소의 stETH balance + wstETH balance + ETH 환산 inline
- wstETH 보유자도 잔액 정상 표시 (Critical #1 해결)
- MetaMask가 Sepolia에 있어도 wagmi `chainId: mainnet.id` pin
- 미연결 → "Connect MetaMask" CTA (inline 모달)
- 모든 LST 0 → "Stake on Lido ↗" 직접 링크

### 시나리오 5: SOL LST 표시
- Phantom 연결 또는 manual 주소 입력된 사용자 → SOL 행 inline LST > 0인 것만 표시 (W8)
- "address not verified" 배지 노출
- WalletBalanceCard에서 SOL 주소 변경 → StakingCard 즉시 반영 (store)
- 미연결 → "Connect Solana wallet" CTA

### 시나리오 6: NSN staking 회귀 없음
- NSN 행 "Stake" → 기존 StakingPanel 정상 동작

### 시나리오 7: invariant guards
- `solana.test.ts` (기존) → SOL_DEVNET_RPC devnet 고정 통과
- `solana-readonly.test.ts` (신규) → SOL_MAINNET_READ_RPC mainnet 호스트 (`toContain('mainnet')` 또는 `toContain('publicnode')`, `not.toContain('devnet')`) 통과
- ETH/SOL LST address frozen snapshot 통과 (literal `toBe`)
- `wstethToSteth` 환산 unit test (입력 ratio=1.18e18, balance=1e18 → 1.18e18) 통과

### 시나리오 8: WalletBalanceCard SOL 회귀 (Phase 3A.3)
- 7개 시나리오 (Phantom connect/disconnect, manual valid/invalid, identityId 전환, store 양방향, identityId flicker) 모두 통과

### 시나리오 9: RPC 장애 graceful
- DevTools에서 RPC offline → react-query retry 후 "RPC unavailable" inline + Retry 버튼 (무한 spinner 금지)

### 시나리오 10: identityId flicker
- auth refresh 시뮬레이션 (`identityId` undefined 일시 변환) → `useSolAddressForIdentity` null 반환 → `useSolLst` `enabled: false`로 fetch 안 함 → 복원 시 정상 fetch

## 결정/가정

- ETH/SOL **Mainnet read-only**, SUI **Testnet**
- SOL mainnet RPC: PublicNode 단독 (`solana-rpc.publicnode.com`, $0). Helius drop.
- ETH mainnet RPC: 기존 wagmi config
- ETH는 **stETH + wstETH** (Critical #1). rETH/cbETH future
- SOL은 **LST 3개** (mSOL/jitoSOL/bSOL). native stake 생략
- SOL ownership 미검증 → self-display, "address not verified" 배지, ecosystem points 사용 금지
- ETH/SOL inline (modal 없음). SUI는 모달 (multiple stakes)
- SUI 모달은 **clean rewrite** (W1: 신규 파일 + 기존 삭제 commit 분리, PR diff 명확)
- import-graph guard는 **단순 vitest string-match + 코드 리뷰** (v5 review Critical #1: ESLint plugin 추가는 prototype 부담, 향후 Phase 9 도입 시 zone 재검토)
- `getSolReadConnection()` factory 패턴 (v5 review Critical #3: vi.mock으로 unit test 시 mock 가능, lazy 초기화)
- Connect MetaMask CTA = **inline 모달** 우선 (W6: 컨텍스트 손실 회피), navigate fallback
- SOL "Manage" = **inline horizontal links** (W9: dropdown 의존성 회피)
- stETH/wstETH 표시 형식: "≈ X.XXXX stETH (Y.YYYY wstETH ≈ Z.ZZ stETH)" (W3: rebasing 명시)
- WalletBalanceCard ↔ StakingCard **의도적 분리** (liquid vs staked)
- SOL Connect CTA = **inline 모달** (v5 review Critical #4: WalletBalanceCard로 navigate 안 함). 공유 `SolAddressInput` 컴포넌트 추출, 두 곳에서 재사용.
- SOL input UX = **"Press Enter to save · Esc to cancel" + valid blur 시 auto-save** (v5 review Critical #5: silent data loss 방지)
- ETH 표시 단순화: "≈ X.XXXX stETH" 합산 + 호버 breakdown 옵션 (review N7)
- wstETH ratio query 별도 1h staleTime (W1: multicall 대역폭 절약)
- Future work: 작업 시점 `gh issue create`, plan은 `doc/plans/`로 복사 (canonical), Issues 일괄 등록 안 함
- store hook: `useSolAddressForIdentity(identityId)`, undefined → null, react-query `enabled: !!solAddress`
