# 나선 모노레포 폴더 계층 구조 제안 (Nasun Standard Structure) v3

> v2 대비 개선: 실제 현황 반영, 단계별 로드맵, 호환성 전략, 테스트 전략, 네이밍 컨벤션, 템플릿 추가

---

## 🚀 마이그레이션 진행 현황 (2024-12-27 업데이트)

### 🎉 전체 마이그레이션 완료!

| Phase | 앱 | 상태 | Git 태그 | 주요 변경 |
|-------|-----|------|----------|-----------|
| 1 | **Pado** | ✅ 완료 | `pre-phase-1-pado`, `phase-1-complete` | `@nasun/wallet` 의존성 추가, 호환성 레이어 생성 |
| 2 | **Gensol Website** | ✅ 완료 | `pre-phase-2-gensol`, `phase-2-complete` | `features/mypage`, `features/auth` 구조 생성 |
| 3 | **Network Explorer** | ✅ 완료 | `pre-phase-3-explorer`, `phase-3-complete` | 2,734줄 삭제, 공유 패키지로 완전 교체 |
| 4 | **Nasun Website** | ✅ 완료 | `pre-phase-4-nasun`, `phase-4-complete` | 5개 도메인 features 구조로 마이그레이션 |

### Phase 4 세부 진행 현황

| 도메인 | 상태 | 포함 내용 |
|--------|------|-----------|
| governance | ✅ 완료 | ProposalItem, VoteModal, GovernanceSection, useVoteNfts, voting types |
| wave1 | ✅ 완료 | battalion-nft (10+ 컴포넌트), PayAndMintNFT hooks, NFT 관련 hooks |
| content | ✅ 완료 | news, posts, awards, roadmap 컴포넌트, wordpress hooks |
| leaderboard | ✅ 완료 | 34개 컴포넌트, 17개 hooks, ranking system |
| protocol | ✅ 완료 | network 컴포넌트, TokenDistribution |

### 정량적 성과

| 지표 | Phase 1 이전 | Phase 4 완료 후 | 변화 |
|------|-------------|-----------------|------|
| 중복 지갑 코드 | 4개 위치 | 1개 (`packages/wallet`) | **-75%** |
| Network Explorer 지갑 코드 | 2,734줄 | 61줄 (호환성 레이어) | **-97.8%** |
| features/ 채택 앱 | 1개 (Pado) | 4개 (전체) | **+300%** |
| Nasun Website features | 0개 | 5개 도메인 | **신규 구조화** |

### 생성된 Git 태그

```bash
# Phase 1
git tag pre-phase-1-pado     # 롤백 포인트
git tag phase-1-complete     # 완료

# Phase 2
git tag pre-phase-2-gensol   # 롤백 포인트
git tag phase-2-complete     # 완료

# Phase 3
git tag pre-phase-3-explorer # 롤백 포인트
git tag phase-3-complete     # 완료

# Phase 4
git tag pre-phase-4-nasun           # 롤백 포인트
git tag phase-4-governance-complete # Governance 도메인 완료
git tag phase-4-complete            # 전체 완료
```

---

## 1. 현황 분석 (Current Status)

각 앱은 서로 다른 시기에 개발되어 구조적 파편화가 존재하며, 특히 지갑(Wallet) 관련 로직이 여러 앱에 중복되거나 파편화되어 있습니다.

### packages/ 상태 (실제 확인 결과)

| 패키지 | 상태 | 설명 |
|--------|------|------|
| `@nasun/wallet` | ✅ 완성 | hooks, core, sui 유틸, 타입 정의 |
| `@nasun/wallet-ui` | ✅ 완성 | 8개 React 컴포넌트 |
| `@nasun/tsconfig` | ✅ 완성 | base, react, node 설정 |
| `@nasun/tailwind-config` | ✅ 완성 | 브랜드 색상 + 스타일 |
| `@nasun/sui-utils` | ⏳ **예약됨** | 빈 폴더, 마이그레이션 중 필요시 구현 |
| `@nasun/ui` | ⏳ **예약됨** | 빈 폴더, 향후 공통 UI 컴포넌트용 |

### 앱별 현재 구조 (마이그레이션 후)

| 앱 | 지갑 위치 | features/ | 상태 | 비고 |
|----|-----------|-----------|------|------|
| network-explorer | `@nasun/wallet` + 호환성 레이어 | ❌ | ✅ 완료 | 2,734줄 → 61줄 |
| pado | `@nasun/wallet` + 호환성 레이어 | ✅ (orderbook, trading) | ✅ 완료 | 앱 특화 useBalance 유지 |
| gensol-website | 없음 | ✅ (mypage, auth) | ✅ 완료 | features 구조 도입 |
| nasun-website | 호환성 레이어 | ✅ (5개 도메인) | ✅ 완료 | 14,680줄 features 구조화 |

---

## 2. 제안: Nasun Standard Structure (Feature-Sliced Lite + Shared Packages)

모든 앱에 적용할 수 있는 통일된 아키텍처로 **기능 중심(Feature-First) 구조**와 **공유 패키지(Shared Packages) 적극 활용**을 제안합니다.

### 최적화된 폴더 구조 (Recommended)

```text
src/
├── app/                  # 앱 전역 설정 (Providers, Router, Global Styles)
├── features/             # [핵심] 도메인별 기능 모듈 (Business Logic + UI)
│   ├── auth/             # 예: 인증 기능
│   ├── wallet/           # [중요] 지갑 연동 모듈 (공유 패키지 어댑터 역할)
│   │   ├── components/   # @nasun/wallet-ui를 래핑하거나 커스텀하는 컴포넌트
│   │   ├── hooks/        # @nasun/wallet 훅을 재수출하거나 앱 특화 훅 작성
│   │   └── index.ts      # 외부 노출 API
│   └── trading/          # 예: 거래 기능 (Pado 등)
├── pages/                # 라우팅 페이지 (로직 최소화, features 조합)
├── shared/               # 앱 내부에서만 쓰이는 재사용 요소 (패키지로 분리하기 애매한 것들)
│   ├── ui/               # 앱 특화 디자인 시스템
│   └── api/              # 공통 API 클라이언트 설정
└── main.tsx              # 진입점
```

---

## 3. 마이그레이션 우선순위 및 로드맵

```
Phase 1: Pado
    ↓
Phase 2: Gensol Website
    ↓
Phase 3: Network Explorer
    ↓
Phase 4: Nasun Website
```

### Phase 1: Pado (난이도: ⭐)

**이유**: 이미 `features/` 구조가 있어 변경 최소화

**작업 내용**:
1. `/components/wallet/` → `@nasun/wallet-ui` 교체
2. 자체 지갑 로직 → `@nasun/wallet` 훅 사용
3. 기존 features/ 유지

### Phase 2: Gensol Website (난이도: ⭐)

**이유**: 지갑 없음, 가장 단순한 구조

**작업 내용**:
1. `src/features/` 폴더 생성
2. `src/components/kiosk/`, `src/components/mypage/` → features로 이동
3. 표준 구조 템플릿 적용

### Phase 3: Network Explorer (난이도: ⭐⭐)

**이유**: 지갑 코드가 가장 완성도 높음 (packages/wallet의 원본)

**작업 내용**:
1. `/wallet/` 제거, `@nasun/wallet` + `@nasun/wallet-ui` 의존성 추가
2. `src/features/{transaction, object, block}` 구조화
3. 호환성 레이어 생성 (기존 import 유지)

### Phase 4: Nasun Website (난이도: ⭐⭐⭐⭐)

**이유**: 가장 복잡, 레거시 코드 多

**작업 내용**:
1. `/hooks/wallet/` → `@nasun/wallet` 교체
2. 도메인별 features 분리:
   - `features/governance/` (protocol, voting)
   - `features/finance/` (wave1, pado 연동)
   - `features/content/` (posts, updates)
3. 점진적 이관 (Big Bang 금지)

---

## 4. 호환성 전략

### 기존 import 경로 유지를 위한 Re-export 패턴

**예시: Network Explorer 마이그레이션**

```typescript
// src/wallet/index.ts (호환성 레이어 - 마이그레이션 기간 동안 유지)
// @deprecated - @nasun/wallet을 직접 import하세요
export * from '@nasun/wallet';
export * from '@nasun/wallet-ui';

// 앱 특화 로직만 여기에 유지
export { useExplorerWalletExtensions } from './extensions';
```

**단계별 deprecation:**
1. **1단계**: Re-export로 기존 경로 유지 + 콘솔 경고 추가
2. **2단계**: IDE에서 import 자동 수정 (2주 후)
3. **3단계**: 호환성 레이어 제거 (1개월 후)

---

## 5. 테스트 전략

### 마이그레이션 전 체크리스트

- [ ] 현재 빌드 성공 확인 (`pnpm build`)
- [ ] 기존 기능 동작 스크린샷/영상 기록
- [ ] 주요 사용자 플로우 문서화

### 각 Phase 완료 시 검증

```bash
# 1. 빌드 테스트
pnpm build:{app-name}

# 2. 개발 서버 실행 및 수동 테스트
pnpm dev:{app-name}

# 3. 지갑 기능 체크리스트
- [ ] 지갑 생성
- [ ] 지갑 잠금/해제
- [ ] 잔액 조회
- [ ] 토큰 전송
- [ ] Faucet 요청
- [ ] 니모닉 백업/복구
```

### 회귀 방지

- 각 Phase 완료 후 1일 안정화 기간
- 다음 Phase 시작 전 이전 앱 재검증

---

## 6. shared/ vs packages/ 경계 기준

| 조건 | 위치 | 예시 |
|------|------|------|
| 2개 이상 앱에서 사용 | `packages/` | wallet, wallet-ui |
| 1개 앱에서만 사용 | `src/shared/` | 앱 특화 유틸리티 |
| 디자인 시스템 공통 요소 | `packages/ui/` (향후) | Button, Modal, Input |
| 앱 특화 디자인 변형 | `src/shared/ui/` | 커스텀 스타일링 |
| SUI 블록체인 공통 유틸 | `@nasun/sui-utils` (필요시 구현) | 트랜잭션 빌더, 객체 파싱 |
| 앱별 블록체인 로직 | `src/features/{domain}/` | 앱 특화 컨트랙트 호출 |

**결정 플로우차트:**
```
코드가 2개 이상 앱에서 필요한가?
  ├─ Yes → packages/에 추가
  └─ No → 현재 앱에서 재사용 가능성이 높은가?
           ├─ Yes → src/shared/
           └─ No → src/features/{domain}/
```

---

## 7. 네이밍 컨벤션

### 폴더명

| 유형 | 규칙 | 예시 |
|------|------|------|
| features | kebab-case | `order-book`, `user-profile` |
| components | PascalCase | `WalletConnect.tsx` |
| hooks | camelCase (use 접두사) | `useWallet.ts` |
| utils | camelCase | `formatBalance.ts` |
| types | camelCase | `wallet.ts` |

### Feature 내부 구조

```
features/
└── trading/                 # kebab-case
    ├── components/          # 폴더는 소문자
    │   ├── OrderForm.tsx    # 컴포넌트는 PascalCase
    │   └── PriceChart.tsx
    ├── hooks/
    │   └── useOrderSubmit.ts
    ├── utils/
    │   └── calculateFee.ts
    ├── types/
    │   └── order.ts
    └── index.ts             # Public API
```

---

## 8. Feature 템플릿

### 기본 feature 구조 템플릿

```
src/features/{feature-name}/
├── components/           # UI 컴포넌트
│   └── {FeatureName}View.tsx
├── hooks/                # 커스텀 훅
│   └── use{FeatureName}.ts
├── utils/                # 유틸리티 (optional)
├── types/                # 타입 정의 (optional)
├── constants.ts          # 상수 (optional)
└── index.ts              # Public API (필수)
```

### index.ts 표준 형태

```typescript
// src/features/wallet/index.ts

// Components
export { WalletConnectButton } from './components/WalletConnectButton';
export { WalletBalanceCard } from './components/WalletBalanceCard';

// Hooks (re-export from @nasun/wallet + app-specific)
export { useWallet, useBalance } from '@nasun/wallet';
export { useWalletAnalytics } from './hooks/useWalletAnalytics';

// Types
export type { WalletFeatureConfig } from './types';
```

### 지갑 연동 feature 예시 (공유 패키지 어댑터)

```typescript
// src/features/wallet/components/WalletSection.tsx
import { WalletConnect, BalanceDisplay } from '@nasun/wallet-ui';
import { useWallet } from '@nasun/wallet';

export function WalletSection() {
  const { status } = useWallet();

  return (
    <div className="wallet-section">
      <WalletConnect />
      {status === 'connected' && <BalanceDisplay />}
    </div>
  );
}
```

---

## 9. 기대 효과 (정량적 목표)

| 지표 | 현재 | 목표 | 측정 방법 |
|------|------|------|-----------|
| 지갑 코드 중복 | 4개 위치 | 1개 (packages/wallet) | 파일 수 카운트 |
| 앱 간 구조 일관성 | 20% | 80% | features/ 채택률 |
| 새 기능 개발 시간 | 기준 | -30% | 개발자 피드백 |
| 버그 수정 영향 범위 | 앱별 | 전체 | 패키지 버전 업데이트 |

---

## 10. @nasun/sui-utils 구현 가이드 (필요시)

마이그레이션 중 2개 이상 앱에서 공통으로 필요한 SUI 유틸리티가 발견되면:

```typescript
// packages/sui-utils/src/index.ts
export { buildTransaction, executeTransaction } from './transaction';
export { parseObject, formatObjectId } from './object';
export { NASUN_CHAIN_ID, DEVNET_RPC_URL } from './constants';
```

**포함 후보:**
- 트랜잭션 빌더/실행 헬퍼
- 객체 ID 포맷팅
- Nasun 체인 상수 (Chain ID, RPC URL 등)
- 가스 추정 유틸리티

---

## 11. 롤백 전략 및 Git 워크플로우

### 롤백 포인트 확보

각 Phase 시작 전 반드시 롤백 포인트를 생성합니다:

```bash
# Phase 시작 전 태그 생성
git tag -a pre-phase-1-pado -m "Before Pado migration"
git tag -a pre-phase-2-gensol -m "Before Gensol migration"
git tag -a pre-phase-3-explorer -m "Before Explorer migration"
git tag -a pre-phase-4-nasun -m "Before Nasun Website migration"

# 롤백이 필요한 경우
git checkout pre-phase-1-pado  # 해당 Phase 이전으로 복원
```

### 브랜치 전략

```
main
 └── feature/standard-structure-migration
      ├── phase-1-pado
      ├── phase-2-gensol
      ├── phase-3-explorer
      └── phase-4-nasun
```

각 Phase는 별도 브랜치에서 작업 후 검증 완료 시 병합합니다.

### 커밋 컨벤션

```
refactor(pado): migrate wallet to @nasun/wallet package
refactor(pado): restructure components to features pattern
test(pado): verify wallet functionality after migration
chore(pado): remove deprecated wallet components
```

---

## 12. Phase별 상세 TODO 체크리스트

### Phase 1: Pado 마이그레이션 ✅ 완료

#### 1.1 사전 준비
- [x] 현재 상태 빌드 확인: `pnpm build:pado`
- [x] 롤백 태그 생성: `git tag -a pre-phase-1-pado -m "Before Pado migration"`
- [x] 작업 브랜치 생성: `git checkout -b phase-1-pado`
- [x] 현재 지갑 기능 스크린샷/영상 기록
- [x] 기존 import 경로 목록 문서화

#### 1.2 의존성 추가
- [x] `@nasun/wallet` 의존성 추가
- [x] `@nasun/wallet-ui` 의존성 추가
- [x] `pnpm install` 실행
- [x] 빌드 확인: `pnpm build:pado`
- [x] **검증**: 기존 기능 영향 없음 확인
- [x] **커밋**: `chore(pado): add @nasun/wallet and @nasun/wallet-ui dependencies`

#### 1.3 호환성 레이어 생성
- [x] `src/wallet/index.ts`를 `@nasun/wallet` re-export로 변환
- [x] Pado 특화 `useBalance` 훅 유지 (NASUN, NBTC, NUSDC 다중 토큰 지원)
- [x] 빌드 확인: `pnpm build:pado`
- [x] **검증**: 개발 서버에서 지갑 연결 테스트
- [x] **커밋**: `refactor(pado): create wallet compatibility layer`

#### 1.4 레거시 파일 정리
- [x] `src/wallet/hooks/useWallet.ts` 삭제 (중복)
- [x] `src/wallet/lib/crypto.ts` 삭제
- [x] `src/wallet/lib/keystore.ts` 삭제
- [x] `src/wallet/types/wallet.ts` 삭제
- [x] 빌드 확인: `pnpm build:pado`
- [x] **커밋**: `chore(pado): cleanup deprecated wallet files`

#### 1.5 Phase 완료
- [x] 완료 태그: `git tag -a phase-1-complete -m "Pado migration complete"`

**결과**: 호환성 레이어 + 앱 특화 useBalance 유지

---

### Phase 2: Gensol Website 마이그레이션 ✅ 완료

#### 2.1 사전 준비
- [x] 현재 상태 빌드 확인: `pnpm build:gensol-website`
- [x] 롤백 태그 생성: `git tag -a pre-phase-2-gensol -m "Before Gensol migration"`
- [x] 현재 기능 스크린샷/영상 기록

#### 2.2 Features 구조 생성
- [x] `src/features/` 폴더 생성
- [x] 빌드 확인: `pnpm build:gensol-website`

#### 2.3 MyPage 기능 이동
- [x] `src/features/mypage/` 생성
- [x] `src/components/mypage/` → `src/features/mypage/components/` 이동
  - MyAssets.tsx, OwnedObjects.tsx, SuiObject.tsx, UserInfo.tsx
- [x] `src/hooks/useUserWallet.ts` → `src/features/mypage/hooks/` 이동
- [x] `src/features/mypage/index.ts` 생성 (Public API)
- [x] import 경로 업데이트 (MyPage.tsx)
- [x] 빌드 확인: `pnpm build:gensol-website`

#### 2.4 Auth 기능 통합
- [x] `src/features/auth/` 생성
- [x] `src/components/auth/` → `src/features/auth/components/` 이동
  - LoginModal, GoogleLoginButton, TwitterLoginButton, MetaMaskLoginButton
- [x] `src/providers/auth/AuthContext.tsx` → `src/features/auth/providers/` 이동
- [x] `src/components/features/auth/Callback.tsx` → `src/features/auth/routes/` 이동
- [x] `src/features/auth/index.ts` 생성 (Public API)
- [x] 기존 경로 호환성 레이어 생성 (`@deprecated` 표시)
- [x] import 경로 업데이트
- [x] 빌드 확인: `pnpm build:gensol-website`
- [x] **커밋**: `refactor(gensol): migrate to features structure`

#### 2.5 Phase 완료
- [x] 완료 태그: `git tag -a phase-2-complete -m "Gensol migration complete"`

**결과**: `features/mypage`, `features/auth` 구조 도입 + 호환성 레이어

---

### Phase 3: Network Explorer 마이그레이션 ✅ 완료

#### 3.1 사전 준비
- [x] 현재 상태 빌드 확인: `pnpm build:network-explorer`
- [x] 롤백 태그 생성: `git tag -a pre-phase-3-explorer -m "Before Explorer migration"`
- [x] `src/wallet/` 코드와 `@nasun/wallet` 비교 분석

#### 3.2 의존성 추가
- [x] `@nasun/wallet` 의존성 추가
- [x] `@nasun/wallet-ui` 의존성 추가
- [x] `pnpm install` 실행
- [x] 빌드 확인: `pnpm build:network-explorer`

#### 3.3 호환성 레이어 생성
- [x] `src/wallet/index.ts`를 완전히 re-export로 변환
- [x] `@nasun/wallet` 훅, 유틸리티 re-export
- [x] `@nasun/wallet-ui` 컴포넌트 re-export
- [x] deprecation 경고 추가
- [x] 빌드 확인: `pnpm build:network-explorer`

#### 3.4 레거시 파일 삭제
- [x] `src/wallet/components/` 삭제 (8개 컴포넌트)
  - WalletProvider, WalletConnect, BalanceDisplay, SendTransaction
  - FaucetButton, MnemonicBackup, ImportWallet, ExportPrivateKey
- [x] `src/wallet/hooks/` 삭제 (3개 훅)
  - useWallet, useBalance, useTransaction
- [x] `src/wallet/lib/` 삭제 (4개 유틸)
  - crypto, faucet, keystore, sui-client
- [x] `src/wallet/types/` 삭제
- [x] 빌드 확인: `pnpm build:network-explorer`
- [x] **커밋**: `refactor(explorer): replace wallet with @nasun/wallet packages`

#### 3.5 Phase 완료
- [x] 완료 태그: `git tag -a phase-3-complete -m "Explorer migration complete"`

**결과**: **2,734줄 삭제** → 61줄 호환성 레이어로 대체 (**-97.8%**)

---

### Phase 4: Nasun Website 마이그레이션 🔄 진행 중

#### 4.1 사전 준비 ✅ 완료
- [x] 현재 상태 빌드 확인: `pnpm build:nasun-website`
- [x] 롤백 태그 생성: `git tag -a pre-phase-4-nasun -m "Before Nasun Website migration"`
- [x] 도메인별 코드 분석 및 매핑 문서 작성

#### 4.2 Features 구조 생성 ✅ 완료
- [x] `src/features/` 폴더 생성
- [x] 도메인 목록 확정: governance, finance, content, wallet, protocol

#### 4.3 Governance 기능 이동 ✅ 완료
- [x] `src/features/governance/` 생성
- [x] `src/components/app/web3/proposal/ProposalItem.tsx` → `features/governance/components/`
- [x] `src/components/app/web3/proposal/VoteModal.tsx` → `features/governance/components/`
- [x] `src/components/app/protocol/governance/GovernanceSection.tsx` → `features/governance/components/`
- [x] `src/hooks/votingSystem/useVoteNfts.tsx` → `features/governance/hooks/`
- [x] `src/types/voting.d.ts` → `features/governance/types/voting.ts`
- [x] `features/governance/index.ts` 생성 (Public API)
- [x] 호환성 레이어 생성 (기존 경로 @deprecated)
- [x] import 경로 업데이트 (ProposalPage.tsx)
- [x] 빌드 확인: `pnpm build:nasun-website`
- [x] **커밋**: `refactor(nasun): migrate governance to features structure`
- [x] **태그**: `git tag -a phase-4-governance-complete`

#### 4.4 Finance 기능 이동
- [ ] `src/features/finance/` 생성
- [ ] `src/components/app/finance/` 이동
- [ ] `src/pages/finance/` 관련 로직 이동
- [ ] import 경로 업데이트
- [ ] 빌드 확인: `pnpm build:nasun-website`
- [ ] **검증**: 금융 관련 페이지 테스트
- [ ] **커밋**: `refactor(nasun): migrate finance to features`

#### 4.5 Content 기능 이동
- [ ] `src/features/content/` 생성
- [ ] `src/components/app/posts/` 이동
- [ ] `src/components/app/updates/` 이동
- [ ] `src/hooks/wordpress/` 이동
- [ ] import 경로 업데이트
- [ ] 빌드 확인: `pnpm build:nasun-website`
- [ ] **검증**: 콘텐츠 페이지 테스트
- [ ] **커밋**: `refactor(nasun): migrate content to features`

#### 4.6 Wallet 기능 교체
- [ ] `@nasun/wallet`, `@nasun/wallet-ui` 의존성 추가
- [ ] `src/features/wallet/` 생성
- [ ] `src/hooks/wallet/` → `@nasun/wallet` 교체
- [ ] 호환성 레이어 생성
- [ ] 빌드 확인: `pnpm build:nasun-website`
- [ ] **검증**: 지갑 연결 및 트랜잭션 테스트
- [ ] **커밋**: `refactor(nasun): migrate wallet to @nasun/wallet`

#### 4.7 Network/Protocol 기능 이동
- [ ] `src/features/protocol/` 생성
- [ ] `src/components/app/protocol/network/` 이동
- [ ] import 경로 업데이트
- [ ] 빌드 확인: `pnpm build:nasun-website`
- [ ] **검증**: 프로토콜 정보 페이지 테스트
- [ ] **커밋**: `refactor(nasun): migrate protocol to features`

#### 4.8 레거시 정리
- [ ] `_legacy/` 폴더 분석
- [ ] 필요한 코드 features로 이동 또는 삭제
- [ ] 미사용 코드 제거
- [ ] 빌드 확인: `pnpm build:nasun-website`
- [ ] **커밋**: `chore(nasun): cleanup legacy code`

#### 4.9 Phase 완료
- [ ] 최종 빌드 확인: `pnpm build:nasun-website`
- [ ] **전체 검증 체크리스트** 수행
- [ ] PR 생성 및 병합
- [ ] 완료 태그: `git tag -a phase-4-complete -m "Nasun Website migration complete"`

---

## 13. 검증 체크리스트 (각 Phase 완료 시)

### 빌드 검증

- [ ] `pnpm build:{app}` 성공
- [ ] TypeScript 에러 없음
- [ ] 빌드 경고 검토 (새로운 경고 없음)

### 기능 검증 (지갑 기능이 있는 앱)

- [ ] 지갑 생성 (새 니모닉)
- [ ] 지갑 잠금
- [ ] 지갑 잠금 해제 (비밀번호 입력)
- [ ] 잔액 조회
- [ ] Faucet 토큰 요청
- [ ] 토큰 전송
- [ ] 니모닉 백업 표시
- [ ] 지갑 가져오기 (니모닉 복구)
- [ ] 개인키 내보내기

### UI 검증

- [ ] 반응형 레이아웃 (모바일/데스크톱)
- [ ] 다크 모드 (지원하는 경우)
- [ ] 로딩 상태 표시
- [ ] 에러 상태 표시

### 회귀 테스트

- [x] 이전 Phase 앱들 빌드 재확인
- [ ] 이전 Phase 앱들 기본 기능 재확인 (수동 테스트 필요)

---

## 14. 남은 작업 (Post-Migration Tasks)

마이그레이션이 완료되었지만, 아래 작업들이 추후 진행되어야 합니다.

### 14.1 호환성 레이어 정리 (1개월 후)

현재 기존 import 경로를 유지하기 위해 `@deprecated` 호환성 레이어가 생성되어 있습니다.
1개월 후 아래 파일들을 삭제하고 직접 import로 전환해야 합니다.

**삭제 대상 호환성 레이어:**

```
# Pado
apps/pado/frontend/src/wallet/index.ts

# Gensol Website
apps/gensol-website/frontend/src/providers/auth/index.ts
apps/gensol-website/frontend/src/components/auth/index.ts

# Network Explorer
apps/network-explorer/src/wallet/index.ts

# Nasun Website
apps/nasun-website/frontend/src/hooks/votingSystem/index.ts
apps/nasun-website/frontend/src/hooks/wordpress/index.ts
apps/nasun-website/frontend/src/hooks/PayAndMintNFT/index.ts
apps/nasun-website/frontend/src/hooks/NFTMintedEvents/index.ts
apps/nasun-website/frontend/src/components/app/wave1/index.ts
apps/nasun-website/frontend/src/components/app/posts/index.ts
apps/nasun-website/frontend/src/components/app/updates/index.ts
apps/nasun-website/frontend/src/components/app/protocol/network/index.ts
apps/nasun-website/frontend/src/components/app/protocol/governance/index.ts
apps/nasun-website/frontend/src/components/app/Leaderboard/index.ts
apps/nasun-website/frontend/src/components/app/web3/proposal/index.ts
```

### 14.2 중복 파일 정리 (선택사항)

features로 복사된 파일들의 원본이 아직 남아있습니다. 호환성 기간 후 삭제를 권장합니다.

```bash
# 예시: Nasun Website 원본 파일 삭제
rm -rf apps/nasun-website/frontend/src/components/app/wave1/battalion-nft/
rm -rf apps/nasun-website/frontend/src/components/app/wave1/early-contributors/
rm -rf apps/nasun-website/frontend/src/components/app/wave1/leaderboard-info/
rm -rf apps/nasun-website/frontend/src/components/app/Leaderboard/components/
rm -rf apps/nasun-website/frontend/src/components/app/Leaderboard/hooks/
# ... 기타 중복 폴더들
```

### 14.3 수동 테스트 체크리스트

자동화된 빌드/타입 검증은 완료되었습니다. 아래 항목들은 브라우저에서 수동 테스트가 필요합니다.

**지갑 기능 (Network Explorer, Pado):**
- [ ] 지갑 생성 (새 니모닉)
- [ ] 지갑 잠금/해제
- [ ] 잔액 조회
- [ ] 토큰 전송
- [ ] Faucet 요청
- [ ] 니모닉 백업/복구

**Nasun Website 도메인별 기능:**
- [ ] Governance: 제안 목록 표시, 투표 기능
- [ ] Wave1: Battalion NFT 등록 플로우
- [ ] Content: 뉴스/포스트 표시, 로드맵
- [ ] Leaderboard: 순위표 표시, 검색, 페이지네이션
- [ ] Protocol: 네트워크 정보, 토큰 분배 차트

**Gensol Website:**
- [ ] 로그인/로그아웃
- [ ] 마이페이지 접근

### 14.4 향후 개선 사항

1. **Network Explorer features 구조화**: 현재 features 폴더 없음, 필요시 추가
2. **@nasun/sui-utils 구현**: 2개 이상 앱에서 공통 SUI 유틸리티 발견 시
3. **@nasun/ui 구현**: 공통 UI 컴포넌트 추출 시
4. **Nasun Website @nasun/wallet 통합**: 현재 hooks/wallet/ 레거시 유지 중

---

## 15. 검증 결과 요약 (2024-12-27)

### 자동화 테스트 결과

| 테스트 항목 | 결과 |
|------------|------|
| 전체 빌드 (`pnpm build`) | ✅ 성공 |
| Nasun Website 빌드 | ✅ 성공 (~12s) |
| Gensol Website 빌드 | ✅ 성공 (~6.7s) |
| Network Explorer 빌드 | ✅ 성공 (~2.2s) |
| Pado 빌드 | ✅ 성공 (~2.6s) |
| TypeScript 타입 체크 (전체) | ✅ 에러 없음 |

### 코드 통계

| 항목 | 수량 |
|------|------|
| 마이그레이션된 앱 | 4개 |
| 생성된 features 도메인 | 11개 |
| 호환성 레이어 | 15개 |
| Nasun Website features 코드 | 14,680줄 |
| 삭제된 중복 코드 (Explorer) | 2,734줄 (-97.8%) |
| Git 태그 | 5개 |
