# 나선 지갑 (Nasun Wallet) 개선 기획안

> 작성일: 2026-01-11 (v2.0 - 리뷰 반영)
> 기준: 2026년 블록체인 지갑 시장 트렌드 분석
> **중요**: Nasun Network는 Sui 포크 기반의 **독립 블록체인**입니다.
> **전략**: 멀티체인 지갑으로 일반 Web3 사용자를 확보한 후, Nasun Network로 유입시키는 "지갑 먼저" 전략
> **목표**: zkLogin + AA + MPC를 결합한 **차세대 지갑 레퍼런스**

---

## 0. 현재 구현 상태

### 완료된 Phase (2026-01-03 기준)

| Phase | 기능 | 상태 | 완료일 |
|-------|------|------|--------|
| Phase 1 | 테스트 인프라 | ✅ 완료 | 2025-12-28 |
| Phase 2 | 멀티토큰 전송 | ✅ 완료 | 2025-12-28 |
| Phase 3 | 스테이킹 | ✅ 완료 | 2025-12-28 |
| Phase 4 | NFT 지원 | ✅ 완료 | 2025-12-28 |
| Phase 5 | 보안 기능 | 🔄 부분 완료 | - |
| Phase 6 | 멀티 지갑 | ⏳ 대기 | - |
| Phase 7 | zkLogin | ✅ 완료 | 2026-01-03 |

### @nasun/wallet (Core Package)

| 카테고리 | 상태 | 테스트 수 |
|----------|------|-----------|
| Wallet Create/Lock/Unlock | ✅ | 17 |
| Balance Query | ✅ | 26 |
| Native Token Transfer | ✅ | - |
| Multi-Token Transfer | ✅ | - |
| Token Registry | ✅ | 17 |
| Staking/Unstaking | ✅ | - |
| Validator Query | ✅ | - |
| NFT Query/Transfer | ✅ | 20 |
| Address Book | ✅ | - |
| Transaction Simulation | ✅ | - |
| Encryption/Crypto | ✅ | 18 |
| zkLogin | ✅ | - |
| **총 테스트** | - | **103** |

**Hooks (12개):**
- Core: `useWallet`, `useBalance`, `useTransaction`
- Multi-Token: `useMultiBalance`, `useTokenTransaction`
- Staking: `useValidators`, `useStaking`, `useStakeTransaction`
- NFT: `useNFTs`, `useNFTTransfer`
- Security: `useAddressBook`, `useAddressStatus`
- zkLogin: `useZkLogin`

### @nasun/wallet-ui (UI Package)

| 컴포넌트 | 상태 | 테스트 수 |
|----------|------|-----------|
| WalletProvider | ✅ | - |
| WalletConnect | ✅ | - |
| BalanceDisplay | ✅ | 18 |
| MultiBalanceDisplay | ✅ | - |
| SendTransaction | ✅ | 21 |
| TokenSelector | ✅ | - |
| NFTCard | ✅ | 24 |
| NFTGallery | ✅ | - |
| NFTDetail | ✅ | - |
| NFTTransfer | ✅ | - |
| StakingPanel | ✅ | - |
| ValidatorList | ✅ | - |
| StakingStatus | ✅ | - |
| SecuritySettings | ✅ | - |
| CopyableAddress | ✅ | - |
| FaucetButton | ✅ | - |
| MnemonicBackup | ✅ | - |
| ImportWallet | ✅ | - |
| ExportPrivateKey | ✅ | - |
| SocialLoginButtons | ✅ | - |
| ZkLoginCallback | ✅ | - |
| AddressBookPanel | ❌ | - |
| **총 테스트** | - | **66** |

**구현 완료: 21개 / 대기: 1개 (AddressBookPanel)**

### 앱 통합 상태

| 앱 | 지갑 통합 | zkLogin |
|----|-----------|---------|
| Pado | ✅ | ✅ |
| Network Explorer | ✅ | ✅ |
| Nasun Website | ✅ | ✅ |
| GenSol Website | ✅ | ✅ |

---

## 1. 현재 상태 vs 시장 트렌드 Gap 분석

### 1.1. 기능별 비교표

| 기능 | 시장 트렌드 (2026) | 나선 지갑 현재 | Gap | 우선순위 |
|------|-------------------|---------------|-----|----------|
| **시드프레이즈 없는 온보딩** | zkLogin, MPC, 멀티카드 백업 | ✅ zkLogin, Passkey 완료 | 낮음 | - |
| **멀티체인 지원** | EVM, Solana, Sui 등 | ❌ Nasun만 | 높음 | P1 |
| **EVM Account Abstraction** | ERC-4337, Smart Account | ❌ 미지원 | **매우 높음** | **P1** |
| **WalletConnect** | 표준 지원 | ❌ 미지원 | 높음 | P1 |
| **Signer 추상화** | Local/Ledger/MPC 통합 | ❌ 미지원 | 높음 | P1 |
| **하드웨어 지갑 연동** | Ledger, Trezor, Keystone 등 | ❌ 미지원 | 높음 | P2 |
| **결제 UX** | Intent 기반, 가스 대납 | ❌ 미지원 | 높음 | P2 |
| **ZK-ID / SSI** | DID/VC + ZK Proof | ❌ 미지원 | 중간 | P2 |
| **NFT 관리** | 갤러리, 잠금, Instant Sell | ✅ 갤러리, 전송 완료 | 중간 | P3 |
| **DApp 브라우저** | 내장 브라우저 | ❌ 미지원 | 중간 | P3 |
| **크로스체인 스왑/브릿지** | Wormhole, 내장 브릿지 | ❌ 미지원 | 중간 | P3 |
| **MPC 보안** | Zengo, Binance 등 도입 | ❌ 미지원 | 중간 | P3 |
| **멀티시그** | Backpack, Ledger 등 | ❌ 미지원 | 중간 | P3 |
| **Recovery Center** | 소셜 복구, 상속 | ❌ 미지원 | 중간 | P3 |
| **토큰 스왑** | DEX 집계, 내장 스왑 | ⚠️ 기본 지원 | 중간 | P3 |
| **실시간 알림** | 트랜잭션 알림, 가격 알림 | ❌ 미지원 | 중간 | P4 |
| **포트폴리오 대시보드** | 자산 추적, PnL, 차트 | ⚠️ 기본 잔액만 | 중간 | P3 |
| **Clear Signing** | Ledger 도입 | ❌ 미지원 | 중간 | P4 |

### 1.2. 나선 지갑의 강점 (선두 그룹)

| 강점 | 설명 | 경쟁력 |
|------|------|--------|
| ✅ zkLogin | Sui 생태계 최초 zkLogin 완전 구현 (Google OAuth) | **선두** |
| ✅ Passkey (WebAuthn) | Face ID, Touch ID, Windows Hello 지원 | **선두** |
| ✅ 보안 | AES-256-GCM, PBKDF2 100K iterations, 속도 제한 | 상위권 |
| ✅ 스테이킹 | 검증자 목록, APY, 포지션 관리 완료 | 상위권 |
| ✅ NFT | 갤러리, 전송, Display 표준 지원 | 상위권 |
| ✅ 멀티토큰 | 토큰 레지스트리, Faucet 연동 | 상위권 |
| ✅ 테스트 커버리지 | 103+ 단위 테스트 | **선두** |

### 1.3. 핵심 Gap 요약 (선도 레벨 달성을 위한)

1. **EVM Account Abstraction** - 2026년 EVM 지갑의 표준, 미지원 시 "2024년 수준 UX"로 인식
2. **Signer 추상화** - Local/Ledger/MPC를 동일 인터페이스로 다루는 아키텍처 부재
3. **멀티체인 미지원** - 일반 Web3 사용자 유입 경로 없음
4. **결제 UX** - Intent 기반 결제, 구독, 커머스 허브 기능 없음
5. **ZK-ID** - 조건부 증명 (성인/KYC/1인1회) 미지원

---

## 2. 개선 로드맵 (v2.0 - 선도 지갑 목표)

### Phase 1: 사용자 확보 + 차세대 아키텍처 (P1)

**목표**: 멀티체인 + AA + Signer 추상화로 **2026년형 지갑 아키텍처** 구축

| 기능 | 설명 | 예상 공수 |
|------|------|----------|
| **Signer 추상화 레이어** | Local/Ledger/MPC 통합 인터페이스 | 2주 |
| **멀티체인 지원** | EVM 체인 (Ethereum, Base, Arbitrum) 우선 | 4주 |
| **EVM Account Abstraction** | ERC-4337 Smart Account (Base, Arbitrum) | 3주 |
| **WalletConnect v2** | 표준 DApp 연동 프로토콜 | 2주 |
| **Nasun Link v2** | 온보딩 캠페인 엔진 (ZK 조건부 수령) | 3주 |

**멀티체인 우선순위**:
1. **EVM 체인** (Ethereum, Base, Arbitrum) - 가장 큰 사용자 풀 + AA 지원
2. **Solana** - 활발한 NFT/DeFi 사용자층
3. **Sui** - 기술 호환성 높음 (Nasun 포크 원본)

**예상 결과물**:
```typescript
// Signer 추상화 아키텍처 (핵심)
interface SignerAdapter {
  type: 'local' | 'ledger' | 'mpc' | 'zklogin';
  getAddress(): Promise<string>;
  sign(tx: Transaction): Promise<SignedTransaction>;
  signPersonal(message: string): Promise<string>;
}

// AA + 가스 대납
useSmartAccount(): SmartAccountState
useGasSponsor(): GasSponsorConfig
useSessionKey({ ttl: number }): SessionKeyManager

// 기존 + 신규 exports
useWalletConnect, connectDApp, disconnectDApp
useNetwork, useSwitchNetwork, NetworkSelector
useNasunLink, NasunLinkCampaign
```

### Phase 2: 보안 강화 + 결제 UX + ZK-ID (P2)

**목표**: 하드웨어 연동 + 결제/커머스 허브 + 조건부 증명

| 기능 | 설명 | 예상 공수 |
|------|------|----------|
| **Ledger 연동** | Signer 추상화에 Ledger Adapter 추가 | 2주 |
| **결제 UX** | Intent 기반 결제, 체인/토큰 자동 선택 | 3주 |
| **ZK-ID 모듈** | 성인 증명, 국가 제한, 1인1회 | 3주 |
| **Clear Signing** | 트랜잭션 내용 명확한 표시 | 1주 |
| **Recovery Center** | 소셜 복구 + 상속 통합 대시보드 | 2주 |

**예상 결과물**:
```typescript
// 결제 UX
usePaymentIntent({ amount: USD, recipient: string }): PaymentFlow
useSubscription(): SubscriptionManager

// ZK-ID
useZkProof(type: 'age' | 'kyc' | 'unique'): ZkProofResult
useVerifiableCredential(): VCManager

// Recovery Center (기능이 아닌 "센터")
useRecoveryCenter(): {
  guardians: Guardian[];
  inheritance: InheritanceConfig;
  addGuardian(address: string): Promise<void>;
  setInheritance(config: InheritanceConfig): Promise<void>;
}
```

### Phase 3: 파워 유저 경험

**목표**: NFT/DeFi 파워 유저를 위한 고급 기능

| 기능 | 설명 | 예상 공수 |
|------|------|----------|
| **NFT 컬렉션 잠금** | 도난 방지 잠금 기능 | 1주 |
| **포트폴리오 대시보드** | 멀티체인 자산 추적, PnL, 차트 | 2주 |
| **DEX 집계 스왑** | 최적 경로 스왑 | 2주 |
| **MPC Signer 구현** | Signer 추상화에 MPC Adapter 추가 | 3주 |
| **DApp 브라우저** | 내장 Web3 브라우저 | 2주 |

**예상 결과물**:
```typescript
// MPC (아키텍처는 P1에서 준비됨)
useMPCSigner(): MPCSignerAdapter

// 기존 + 향상
usePortfolio(): MultiChainPortfolio
usePriceAlerts, useOptimalSwap
PortfolioDashboard, NFTLockPanel, DAppBrowser
```

### Phase 4: 생태계 확장 (장기)

| 기능 | 설명 | 예상 공수 |
|------|------|----------|
| **크로스체인 브릿지** | 내장 브릿지 UI | 3주 |
| **실시간 알림** | 트랜잭션, 가격 알림 | 1주 |
| **Pado Deep Integration** | 마진/예측/복권 원클릭 | 2주 |

---

## 3. 우선순위별 상세 기획

### 3.1. [P1] Signer 추상화 아키텍처 (핵심)

**배경**: Local key, Ledger, MPC, zkLogin을 **동일 인터페이스**로 다루는 아키텍처.
MPC 구현이 늦어져도 **아키텍처는 이미 2026년형**이 됨.

**전략적 가치**:
- MPC, Ledger 등 추후 확장이 **플러그인 방식**으로 가능
- 사용자는 서명 방식을 **자유롭게 전환** 가능
- 테스트 용이성 향상 (Mock Signer)

**구현 방향**:
```typescript
// core/signer/types.ts
interface SignerAdapter {
  readonly type: SignerType;
  readonly address: string;

  sign(tx: Transaction): Promise<SignedTransaction>;
  signPersonal(message: Uint8Array): Promise<Signature>;

  // Optional capabilities
  supportsSessionKeys?: boolean;
  supportsBatchSign?: boolean;
}

type SignerType = 'local' | 'ledger' | 'mpc' | 'zklogin' | 'smart-account';

// core/signer/adapters/
LocalSigner implements SignerAdapter
LedgerSigner implements SignerAdapter  // P2
MPCSigner implements SignerAdapter      // P3
ZkLoginSigner implements SignerAdapter  // 이미 완료
SmartAccountSigner implements SignerAdapter  // P1 (AA)

// hooks/useSigner.ts
useSigner(): {
  current: SignerAdapter;
  available: SignerAdapter[];
  switchSigner(type: SignerType): Promise<void>;
}
```

### 3.2. [P1] EVM Account Abstraction (AA)

**배경**: 2026년 EVM 지갑의 상위 20%는 AA 기반.
미지원 시 "멀티체인은 되지만 UX는 2024년 수준"이라는 인상.

**핵심 기능**:
- 가스 대납 (Paymaster)
- 세션 키 (자동 승인)
- 배치 트랜잭션
- 소셜 복구 (Guardian)

**지원 체인** (PoC):
- Base (ERC-4337 네이티브)
- Arbitrum (ERC-4337 네이티브)

**구현 방향**:
```typescript
// hooks/useSmartAccount.ts
useSmartAccount(): {
  isDeployed: boolean;
  address: string;
  deploy(): Promise<void>;
}

// hooks/useGasSponsor.ts
useGasSponsor(): {
  isSponsored: boolean;
  sponsorAddress: string;
  estimateGas(tx: Transaction): Promise<GasEstimate>;
}

// hooks/useSessionKey.ts
useSessionKey(config: SessionKeyConfig): {
  isActive: boolean;
  expiresAt: number;
  create(permissions: Permission[]): Promise<SessionKey>;
  revoke(): Promise<void>;
}

interface SessionKeyConfig {
  ttl: number;  // milliseconds
  permissions: Permission[];
  maxTransactions?: number;
  maxValue?: bigint;
}
```

**기술 스택**:
```json
{
  "permissionless": "^0.2.x",
  "viem": "^2.x",
  "@pimlico/sdk": "^0.2.x"
}
```

### 3.3. [P1] 멀티체인 지원

**배경**: 일반 Web3 사용자를 나선 지갑으로 유입시키는 핵심 전략.

**지원 체인 우선순위**:
| 순위 | 체인 | AA 지원 | 이유 |
|------|------|---------|------|
| 1 | Base | ✅ ERC-4337 | Coinbase 생태계, 저비용 |
| 2 | Arbitrum | ✅ ERC-4337 | DeFi 허브 |
| 3 | Ethereum | ✅ ERC-4337 | 최대 자산 |
| 4 | Solana | ❌ | NFT/DeFi 커뮤니티 |
| 5 | Sui | ❌ | 기술 호환성 |

**구현 방향**:
```typescript
// config/chains.ts
export const SUPPORTED_CHAINS = {
  'nasun-devnet': {
    type: 'move',
    rpc: '...',
    chainId: '6681cdfd',
    aa: false
  },
  'base': {
    type: 'evm',
    rpc: '...',
    chainId: 8453,
    aa: true,
    bundler: 'https://...',
    paymaster: 'https://...'
  },
  // ...
};

// hooks/useMultiChain.ts
useCurrentChain(): ChainConfig
useSwitchChain(chainId: string): Promise<void>
useChainBalance(chainId: string): Balance
```

### 3.4. [P1] Nasun Link v2 (온보딩 캠페인 엔진)

**배경**: 단순 전송 기능이 아닌 **Web3 온보딩 인프라**.
zkLogin과 결합하여 Sui 계열에서 **유일한 포지션** 확보.

**v1 → v2 확장**:

| 기능 | v1 (기본) | v2 (캠페인 엔진) |
|------|-----------|------------------|
| 기본 전송 | ✅ | ✅ |
| ZK 조건부 수령 | ❌ | ✅ 성인/국가/1인1회 |
| 수령 후 가스 무료 | ❌ | ✅ N건 가스 지원 |
| 자동 스왑/브릿지 | ❌ | ✅ |
| 캠페인 분석 | ❌ | ✅ 전환율/수령률 |

**구현 방향**:
```typescript
// hooks/useNasunLink.ts
interface NasunLinkConfig {
  token: TokenType;
  amount: bigint;

  // v2: 조건부 수령
  conditions?: {
    ageVerification?: boolean;      // 성인 증명
    countryRestriction?: string[];  // 국가 제한
    uniqueClaim?: boolean;          // 1인 1회
    zkProofRequired?: ZkProofType;
  };

  // v2: 수령 후 혜택
  onClaim?: {
    freeGasCount?: number;          // N건 가스 무료
    autoSwapTo?: TokenType;         // 자동 스왑
    autoBridgeTo?: ChainId;         // 자동 브릿지
  };

  expiresAt?: number;
}

useCreateLink(config: NasunLinkConfig): Promise<LinkData>
useClaimLink(linkId: string): Promise<ClaimResult>

// 캠페인 분석
useLinkAnalytics(linkId: string): {
  views: number;
  claims: number;
  conversionRate: number;
}
```

**사용자 플로우**:
```
1. 마케터: 캠페인 설정 → 링크 생성 → SNS 공유
2. 신규 유저:
   링크 클릭 → ZK 조건 검증 (성인?) →
   Google 로그인 → 지갑 자동 생성 →
   자산 수령 + 5건 가스 무료
```

### 3.5. [P2] ZK-ID 모듈

**배경**: 2026년에는 DID/VC + ZK Proof를 **지갑 레벨에서 다루는지**가 차별점.

**핵심 증명 유형**:
- **Age Verification**: 성인 증명 (생년월일 노출 없이)
- **KYC Status**: KYC 통과 여부 (개인정보 노출 없이)
- **Unique Human**: 1인 1회 참여 보장 (Worldcoin 스타일)
- **Country**: 국가/지역 증명

**구현 방향**:
```typescript
// hooks/useZkId.ts
useZkProof(type: ZkProofType): {
  hasProof: boolean;
  proof: ZkProof | null;
  generate(): Promise<ZkProof>;
  verify(proof: ZkProof): Promise<boolean>;
}

type ZkProofType =
  | 'age:18+'
  | 'age:21+'
  | 'kyc:basic'
  | 'kyc:enhanced'
  | 'unique:campaign-id'
  | 'country:allowed';

// UI 컴포넌트
ZkIdVerification  // 증명 생성 UI
ZkIdBadge         // 증명 상태 표시
```

### 3.6. [P2] 결제 UX (Intent 기반)

**배경**: 2026년 지갑은 DeFi/NFT 중심에서 **결제/구독/커머스 허브**로 진화.
Pado(예측/마진/복권)와 결합하면 엄청난 시너지 가능.

**핵심 기능**:
- Intent 기반: "이만큼 USD 내고 싶다" → 체인/토큰 자동 선택
- 구독 결제: 반복 결제 승인 관리
- 가스 추상화: 사용자는 가스를 몰라도 됨

**구현 방향**:
```typescript
// hooks/usePayment.ts
usePaymentIntent(intent: PaymentIntent): {
  route: PaymentRoute;
  execute(): Promise<PaymentResult>;
}

interface PaymentIntent {
  amount: { value: number; currency: 'USD' | 'EUR' | 'KRW' };
  recipient: string;
  memo?: string;
}

interface PaymentRoute {
  sourceChain: ChainId;
  sourceToken: TokenType;
  steps: PaymentStep[];  // swap, bridge, transfer
  estimatedFee: { usd: number };
  estimatedTime: number;
}

// 구독 결제
useSubscription(): {
  active: Subscription[];
  create(config: SubscriptionConfig): Promise<void>;
  cancel(id: string): Promise<void>;
}
```

### 3.7. [P2] Recovery & Inheritance Center

**배경**: 대부분의 지갑은 복구/상속을 메뉴 깊숙이 숨김.
이 영역은 **메이저 지갑도 UX가 미성숙**하여 잘 만들면 **신뢰 브랜드**가 됨.

**차별화**:
- "기능"이 아닌 **"센터"**로 격상
- zkLogin/Passkey 계정에도 소셜 복구 연결
- 타임락 + 오프체인 검증 조합

**구현 방향**:
```typescript
// hooks/useRecoveryCenter.ts
useRecoveryCenter(): {
  // 소셜 복구
  guardians: Guardian[];
  recoveryThreshold: number;  // N-of-M
  addGuardian(contact: GuardianContact): Promise<void>;
  removeGuardian(address: string): Promise<void>;
  initiateRecovery(): Promise<RecoveryRequest>;

  // 상속
  inheritance: InheritanceConfig | null;
  setInheritance(config: InheritanceConfig): Promise<void>;

  // 상태
  lastActivity: Date;
  isInRecovery: boolean;
}

interface InheritanceConfig {
  beneficiaries: Beneficiary[];
  inactivityPeriod: Duration;  // e.g., 365 days
  notificationChannels: ('email' | 'sms')[];
}

// UI 컴포넌트
RecoveryCenter        // 통합 대시보드
GuardianManager       // 가디언 관리
InheritancePlanner    // 상속 설정
RecoveryStatus        // 복구 진행 상태
```

---

## 4. 차별화 전략 (선도 포지셔닝)

### 4.1. 기술적 스토리텔링

**"Nasun Wallet = zkLogin + AA + MPC를 자연스럽게 결합한 지갑"**

| 요소 | 설명 | 차별점 |
|------|------|--------|
| zkLogin | 소셜 로그인으로 시드 없는 온보딩 | Sui 계열 최초 완성 |
| AA (ERC-4337) | 가스 대납, 세션 키, 배치 TX | EVM에서 2026년형 UX |
| Signer 추상화 | Local/Ledger/MPC 통합 | 아키텍처 확장성 |
| Nasun Link v2 | ZK 조건부 온보딩 | Web3 온보딩 인프라 |

### 4.2. Pado 생태계 통합

나선 지갑 + Pado의 시너지:

- **원클릭 마진 트레이딩**: 지갑에서 바로 Pado 마진 입금
- **예측 시장 연동**: 지갑 내 예측 시장 참여
- **복권 참여**: 지갑 내 복권 구매
- **결제 UX**: Pado 수익금으로 결제

### 4.3. 개발자 친화적 SDK

- 오픈소스 지갑 SDK 제공
- DApp 개발자를 위한 통합 가이드
- Signer 추상화 인터페이스 공개
- 테스트넷 Faucet 연동

---

## 5. 성공 지표 (KPI)

| 지표 | 현재 | 목표 (6개월) | 선도 레벨 |
|------|------|-------------|-----------|
| 일일 활성 사용자 (DAU) | - | 1,000+ | 5,000+ |
| AA 사용 비율 | 0% | 30% | 50%+ |
| Nasun Link 전환율 | - | 20% | 40%+ |
| 연결된 DApp 수 | 0 | 20+ | 50+ |
| 하드웨어 지갑 연동 사용자 | 0 | 100+ | 500+ |
| ZK-ID 증명 발급 수 | 0 | 500+ | 2,000+ |
| NFT 전송 건수/일 | - | 500+ | 2,000+ |
| 평균 세션 시간 | - | 5분+ | 10분+ |

---

## 6. 결론 및 권장사항

### 즉시 착수 권장 (P1) - 차세대 아키텍처
1. **Signer 추상화 레이어** - 모든 확장의 기반
2. **EVM Account Abstraction** - 2026년 필수 UX (Base, Arbitrum)
3. **멀티체인 지원** - 일반 Web3 사용자 유입
4. **WalletConnect v2** - 멀티체인 DApp 연동
5. **Nasun Link v2** - ZK 조건부 온보딩 캠페인 엔진

### 중기 착수 권장 (P2) - 신뢰 + 결제
6. **Ledger 연동** - Signer 추상화에 Adapter 추가
7. **ZK-ID 모듈** - 조건부 증명
8. **결제 UX** - Intent 기반 결제
9. **Recovery & Inheritance Center** - 신뢰 브랜드

### 장기 착수 권장 (P3-P4) - 파워 유저
10. MPC Signer 구현 (아키텍처는 P1에서 준비됨)
11. NFT 잠금, 포트폴리오, DEX 집계
12. DApp 브라우저, 크로스체인 브릿지

---

## 핵심 메시지 (v2.0)

나선 지갑은 **"zkLogin + AA + MPC를 결합한 차세대 지갑 레퍼런스"**로서:

- **Signer 추상화**로 Local/Ledger/MPC를 동일 인터페이스로 다룸
- **EVM AA**로 가스 대납, 세션 키 등 2026년형 UX 제공
- **Nasun Link v2**로 ZK 조건부 온보딩 캠페인 인프라 구축
- **멀티체인 지원**으로 일반 Web3 사용자를 먼저 확보
- 사용자가 자연스럽게 **Nasun Network의 잠재 사용자**로 전환
- **기술적으로 기억되는 지갑**이 될 수 있음

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| v1.0 | 2026-01-11 | 초안 작성 |
| v2.0 | 2026-01-11 | 리뷰 반영: AA, Signer 추상화, ZK-ID, Recovery Center, Nasun Link v2 추가 |
