# 나선 지갑 (Nasun Wallet) 구현 상태 문서

> 최종 업데이트: 2026-01-11

## 소개

나선 모노레포의 앱들은 나선 지갑 패키지인 `@nasun/wallet`과 `@nasun/wallet-ui`를 공통으로 사용하여 지갑 기능을 제공합니다.

나선 지갑은 나선 블록체인을 위한 안전하고 기능이 풍부한 지갑 라이브러리로, **코어 로직**과 **UI 컴포넌트**를 분리하여 모듈화된 구조를 가지고 있습니다.

---

## 패키지 개요

### @nasun/wallet (코어 패키지)

| 항목 | 내용 |
|------|------|
| 버전 | 0.1.0 |
| 위치 | `packages/wallet` |
| 타입 | TypeScript 모듈 |
| 상태 | ✅ Production-Ready |

**주요 의존성:**

```json
{
  "@mysten/sui": "^1.45.2",           // Sui 블록체인 SDK
  "@scure/bip39": "^2.0.0",           // BIP39 니모닉 생성
  "@tanstack/react-query": "^5.0.0",  // 데이터 페칭 및 캐싱
  "zustand": "^5.0.0",                // 경량 상태 관리
  "zod": "^4.1.11"                    // 런타임 스키마 검증
}
```

### @nasun/wallet-ui (UI 컴포넌트 패키지)

| 항목 | 내용 |
|------|------|
| 버전 | 0.1.0 |
| 위치 | `packages/wallet-ui` |
| 타입 | TypeScript React 컴포넌트 |
| 상태 | ✅ Production-Ready |

**주요 의존성:**

```json
{
  "@nasun/wallet": "workspace:*",     // 코어 패키지
  "react": "^18.0.0 || ^19.0.0",      // React 프레임워크
  "tailwindcss": "^3.4.0"             // 스타일링
}
```

---

## 패키지 구조

### @nasun/wallet 디렉토리 구조

```
packages/wallet/src/
├── hooks/                    # React Hooks (15개)
│   ├── useWallet.ts          # 코어 상태 관리 (Zustand)
│   ├── useBalance.ts         # 네이티브 토큰 잔액
│   ├── useMultiBalance.ts    # 멀티 토큰 잔액
│   ├── useTransaction.ts     # 네이티브 토큰 전송
│   ├── useTokenTransaction.ts # 멀티 토큰 전송
│   ├── useNFTs.ts            # NFT 갤러리 (페이지네이션)
│   ├── useNFTTransfer.ts     # NFT 전송
│   ├── useValidators.ts      # 검증자 목록 (APY 포함)
│   ├── useStaking.ts         # 스테이킹 포지션
│   ├── useStakeTransaction.ts # 스테이크/언스테이크
│   ├── useAddressBook.ts     # 주소록 관리
│   ├── useNetwork.ts         # 네트워크 감지
│   ├── useTokenFaucet.ts     # 토큰 Faucet
│   ├── useZkLogin.ts         # zkLogin 인증
│   └── usePasskey.ts         # WebAuthn 패스키
├── core/                     # 코어 로직 (5개)
│   ├── crypto.ts             # 암호화 (니모닉, 암호화)
│   ├── keystore.ts           # 키 저장소 (AES-256-GCM)
│   ├── rate-limit.ts         # 브루트포스 보호
│   ├── zklogin.ts            # zkLogin 유틸리티
│   └── passkey.ts            # WebAuthn 유틸리티
├── sui/                      # Sui 블록체인 유틸리티 (5개)
│   ├── client.ts             # RPC 클라이언트
│   ├── faucet.ts             # 네이티브 토큰 Faucet
│   ├── tokenFaucet.ts        # 멀티 토큰 Faucet
│   ├── staking.ts            # 스테이킹 RPC
│   └── nft.ts                # NFT 쿼리 & 전송
├── config/                   # 설정 (3개)
│   ├── tokens.ts             # 토큰 레지스트리
│   ├── networks.ts           # 네트워크 정의
│   └── index.ts              # 설정 Export
├── types/                    # TypeScript 타입 (6개)
│   ├── index.ts              # 메인 타입
│   ├── staking.ts            # 스테이킹 타입
│   ├── nft.ts                # NFT 타입
│   ├── zklogin.ts            # zkLogin 타입
│   ├── passkey.ts            # 패스키 타입
│   └── schemas.ts            # Zod 스키마
├── stores/                   # Zustand 스토어 (1개)
│   └── zkLoginStore.ts       # zkLogin 상태 관리
├── __tests__/                # 단위 테스트 (11개 파일)
└── index.ts                  # 메인 Export
```

### @nasun/wallet-ui 디렉토리 구조

```
packages/wallet-ui/src/
├── WalletProvider.tsx        # React Provider 래퍼
├── WalletConnect.tsx         # 메인 지갑 UI (연결/생성/잠금해제)
├── BalanceDisplay.tsx        # 네이티브 잔액 표시
├── MultiBalanceDisplay.tsx   # 멀티 토큰 잔액 표시
├── SendTransaction.tsx       # 토큰 전송 UI
├── TokenSelector.tsx         # 토큰 드롭다운 선택기
├── TokenFaucetButton.tsx     # 멀티 토큰 Faucet
├── FaucetButton.tsx          # 네이티브 토큰 Faucet
├── MnemonicBackup.tsx        # 니모닉 백업 UI
├── ImportWallet.tsx          # 지갑 가져오기 폼
├── ExportPrivateKey.tsx      # 개인키 내보내기
├── CopyableAddress.tsx       # 주소 표시 + 복사
├── SecuritySettings.tsx      # 자동 잠금, 대형 TX 경고
├── AddressBookPanel.tsx      # 주소록 관리 (⚠️ UI 미완성)
├── NFTCard.tsx               # NFT 카드 컴포넌트
├── NFTGallery.tsx            # NFT 그리드 갤러리
├── NFTDetail.tsx             # NFT 상세 모달
├── NFTTransfer.tsx           # NFT 전송 플로우
├── ValidatorList.tsx         # 검증자 목록 (APY 포함)
├── StakingPanel.tsx          # 스테이킹 UI (3탭)
├── StakingStatus.tsx         # 스테이킹 요약 표시
├── SocialLoginButtons.tsx    # zkLogin 버튼 (Google 등)
├── ZkLoginCallback.tsx       # OAuth 콜백 핸들러
├── PasskeyButton.tsx         # 패스키 등록 버튼
├── NetworkBadge.tsx          # 네트워크 상태 표시
├── NetworkSelector.tsx       # 네트워크 전환기
├── __tests__/                # 컴포넌트 테스트 (5개 파일)
└── index.ts                  # 컴포넌트 Export
```

---

## 기능 완성도 매트릭스

### 코어 지갑 기능

| 기능 | 상태 | 구현체 | 비고 |
|------|------|--------|------|
| 지갑 생성 | ✅ 완료 | `createWallet()` + BIP39 | Ed25519 키페어 |
| 지갑 가져오기 | ✅ 완료 | 니모닉 & 개인키 | Bech32 형식 지원 |
| 잠금/잠금해제 | ✅ 완료 | AES-256-GCM + PBKDF2 | 100,000 iterations |
| 세션 지속성 | ✅ 완료 | XOR 난독화 + TTL | 기본값: 비활성화 |
| 자동 잠금 | ✅ 완료 | 타임아웃 기반 | 5/15/30분/1시간 |
| 메모리 보안 | ✅ 완료 | `secureZero()` | 사용 후 정리 |

### 토큰 관리

| 기능 | 상태 | 구현체 | 비고 |
|------|------|--------|------|
| 네이티브 토큰 (NASUN) | ✅ 완료 | 9 decimals | 자동 등록 |
| 멀티 토큰 지원 | ✅ 완료 | 토큰 레지스트리 | NBTC, NUSDC 사전 등록 |
| 토큰 레지스트리 | ✅ 완료 | In-memory Map + localStorage | 동적 토큰 등록 |
| 커스텀 토큰 등록 | ✅ 완료 | `registerToken()` | 런타임 추가 |
| 토큰 Faucet | ✅ 완료 | 네이티브 + Move 컨트랙트 | 24시간 쿨다운 |

### 트랜잭션 기능

| 기능 | 상태 | 구현체 | 비고 |
|------|------|--------|------|
| 네이티브 전송 | ✅ 완료 | `useTransaction` | 가스 추정 포함 |
| 멀티 토큰 전송 | ✅ 완료 | `useTokenTransaction` | 비네이티브 수수료 경고 |
| 트랜잭션 시뮬레이션 | ✅ 완료 | `simulateTransaction()` | 사전 검증 |
| 탐색기 링크 | ✅ 완료 | URL 빌더 | TX, 주소, 오브젝트 |
| 대형 TX 확인 | ✅ 완료 | 설정 가능한 임계값 | SecuritySettings |

### NFT 관리

| 기능 | 상태 | 구현체 | 비고 |
|------|------|--------|------|
| NFT 쿼리 | ✅ 완료 | `useNFTs` + 페이지네이션 | 커서 기반 |
| Display 표준 | ✅ 완료 | `buildDisplayFromContent()` | 폴백 지원 |
| NFT 전송 | ✅ 완료 | `useNFTTransfer` | 확인 플로우 |
| 이미지 처리 | ✅ 완료 | IPFS 게이트웨이 변환 | 온체인 URL 폴백 |
| 갤러리 UI | ✅ 완료 | 반응형 그리드 (2-4열) | 상세 모달 |

### 스테이킹 기능

| 기능 | 상태 | 구현체 | 비고 |
|------|------|--------|------|
| 검증자 목록 | ✅ 완료 | APY, 커미션, 풀 | `useValidators` |
| 스테이킹 포지션 | ✅ 완료 | 활성 & 대기 추적 | 실시간 PnL |
| 스테이크/언스테이크 | ✅ 완료 | `useStakeTransaction` | 최소 1 NASUN |
| 에러 처리 | ✅ 완료 | MoveAbort 코드 파싱 | 사용자 친화적 메시지 |
| 스테이킹 패널 UI | ✅ 완료 | 3탭 인터페이스 | 검증자, 포지션, 언스테이크 |

### 인증 기능

| 기능 | 상태 | 구현체 | 비고 |
|------|------|--------|------|
| zkLogin (Google OAuth) | ✅ 완료 | Phase 7 완료 (2026-01-03) | Prover + Salt Lambda |
| 패스키 (WebAuthn) | ✅ 완료 | 플랫폼 & 크로스 디바이스 | Face ID, Touch ID 등 |
| zkLogin UI 버튼 | ✅ 완료 | `SocialLoginButtons` | 콜백 핸들러 포함 |
| 패스키 UI 버튼 | ✅ 완료 | `PasskeyButton` | 등록 + 인증 |

### 네트워크 지원

| 기능 | 상태 | 구현체 | 비고 |
|------|------|--------|------|
| Nasun Devnet | ✅ 완료 | 기본 네트워크 | Chain ID: 6681cdfd |
| 네트워크 감지 | ✅ 완료 | `useNetwork()` | 동적 감지 |
| 네트워크 전환기 | ✅ 완료 | `NetworkSelector` | UI 드롭다운 |
| 멀티체인 | ⏳ 계획됨 | Phase 9 | Sui 메인넷 지원 예정 |

---

## 앱 통합 상태

| 앱 | 패키지 사용 | 통합 수준 | 주요 사용처 |
|----|------------|----------|------------|
| **pado** | ✅ 둘 다 | 깊음 (40+ imports) | 트레이딩, 마진, 스테이킹, 복권 |
| **network-explorer** | ✅ 둘 다 | 중간 (15+ imports) | 지갑 표시, 잔액 쿼리 |
| **nasun-website** | ✅ 둘 다 | 가벼움 (8+ imports) | Hero UI, 거버넌스 |
| **gensol-website** | ✅ 둘 다 | 가벼움 (5+ imports) | 기본 지갑 연결 |

---

## 보안 기능

### 암호화

- **AES-256-GCM**: 산업 표준 대칭 암호화
- **PBKDF2**: 키 파생을 위한 100,000회 반복
- **안전 메모리**: 사용 후 개인키 메모리에서 삭제 (`secureZero`, `secureZeroString`)

### 속도 제한 (브루트포스 보호)

실패한 비밀번호 시도에 대한 점진적 잠금 정책:

| 실패 시도 | 잠금 기간 |
|----------|----------|
| 8회 | 30초 |
| 12회 | 5분 |
| 16회 이상 | 30분 |

- 성공적 잠금 해제 시에만 카운터 리셋
- localStorage에 상태 지속 (페이지 새로고침 후에도 유지)

### 자동 잠금

- 구성 가능한 타임아웃: 5분 / 15분 / 30분 / 1시간 / 비활성화
- 비활성 시 자동 지갑 잠금

### 세션 지속성 보안

`sessionPersist`가 활성화되면 (기본적으로 비활성화), 페이지 새로고침 시 지갑 자동 잠금 해제 가능:

- **30분 만료**: 30분 후 세션 자동 만료
- **도메인 바인딩**: 다른 도메인에서 세션 사용 불가
- **XOR 난독화**: 우연한 검사에 대한 최소 보호
- **sessionStorage**: 브라우저 탭 닫을 때 자동 삭제

> ⚠️ **참고**: 세션 지속성은 편의 기능으로 보안 트레이드오프가 있습니다. 최대 보안을 위해 `sessionPersist`를 비활성화하세요.

### 대형 트랜잭션 확인

- 대형 전송을 위한 선택적 확인
- 구성 가능한 임계값 금액

---

## 테스트 커버리지

### @nasun/wallet 테스트 스위트

| 항목 | 수치 |
|------|------|
| 총 테스트 | 103+ |
| 테스트 파일 | 11개 |
| 테스트 LOC | ~1,964줄 |

**모듈별 분류:**

| 모듈 | 테스트 수 |
|------|----------|
| Crypto | 18 (암호화, 니모닉, 키생성) |
| Keystore | 17 (저장소, 가져오기, 내보내기) |
| Tokens | 17 (레지스트리, 커스텀 토큰) |
| Client | 26 (잔액 쿼리, 주소 유틸) |
| NFT | 20 (쿼리, 전송, 표시) |
| Rate Limiting | ~10 |
| Address Book | ~10 |
| Staking | ~8 |
| Token Transaction | ~8 |
| Sanity | 3 |

### @nasun/wallet-ui 테스트 스위트

| 항목 | 수치 |
|------|------|
| 총 테스트 | 66+ |
| 테스트 파일 | 5개 |

**컴포넌트별 분류:**

| 컴포넌트 | 테스트 수 |
|----------|----------|
| BalanceDisplay | 18 |
| SendTransaction | 21 |
| NFTCard | 24 |
| Sanity | 3 |

**테스트 프레임워크**: Vitest + Happy DOM

```bash
# 테스트 실행
pnpm test

# 커버리지 리포트
pnpm test:coverage
```

---

## API 요약

### @nasun/wallet 주요 Export

**Hooks (15개):**

```typescript
// 코어
useWallet, useBalance, useMultiBalance, useTransaction, useTokenTransaction

// NFT
useNFTs, useNFTTransfer

// 스테이킹
useValidators, useStaking, useStakeTransaction

// 기타
useAddressBook, useNetwork, useTokenFaucet, useZkLogin, usePasskey
```

**유틸리티 (50+개):**

```typescript
// 설정
configureWallet, configureZkLogin, registerToken, registerTokenFaucet

// 포맷팅
formatBalance, parseAmount, shortenAddress, shortenAddressResponsive

// 암호화
generateMnemonicPhrase, isValidMnemonic, secureZero

// 탐색기
getExplorerTxUrl, getExplorerAddressUrl, getExplorerObjectUrl

// 트랜잭션
simulateTransaction

// zkLogin
fetchSalt, fetchZkProof, signWithZkLogin, createZkLoginSession

// 패스키
registerPasskey, authenticateWithPasskey, createPasskeyWallet
```

**타입 (50+개):**

```typescript
WalletStatus, WalletAccount, WalletConfig
TokenConfig, TokenBalance, MultiTokenBalanceInfo
ZkLoginSession, ZkLoginProof, ZkLoginState
PasskeyCredential, PasskeyWalletState
// + NFT 타입, Staking 타입, Security 타입 등
```

### @nasun/wallet-ui 주요 Export

**Provider & 코어:**
- `WalletProvider` (React 컨텍스트 래퍼)
- `WalletConnect` (메인 지갑 UI)

**잔액 & 전송:**
- `BalanceDisplay`, `MultiBalanceDisplay`, `TokenSelector`
- `SendTransaction`, `FaucetButton`, `TokenFaucetButton`

**NFT:**
- `NFTCard`, `NFTGallery`, `NFTDetail`, `NFTTransfer`

**스테이킹:**
- `ValidatorList`, `StakingPanel`, `StakingStatus`

**보안 & 설정:**
- `SecuritySettings`, `CopyableAddress`
- `AddressBookPanel` (⚠️ UI 미완성)

**지갑 관리:**
- `MnemonicBackup`, `ImportWallet`, `ExportPrivateKey`

**인증:**
- `SocialLoginButtons`, `ZkLoginCallback`, `PasskeyButton`

**네트워크:**
- `NetworkBadge`, `NetworkSelector`

---

## 알려진 제한사항

### 1. AddressBookPanel UI 컴포넌트

- **상태**: ⚠️ 미완성
- **누락**: 주소록 관리 UI 구현
- **완료**: `useAddressBook` 훅, 백엔드 로직, 타입
- **영향**: 낮음 - 코어 기능은 훅으로 동작, UI는 편의 레이어

### 2. 멀티 지갑 지원

- **상태**: ⏳ 계획됨 (Phase 6)
- **설명**: 사용자당 여러 지갑 계정 관리
- **영향**: 급하지 않음 - 현재 단일 지갑 모델

### 3. 멀티체인 지원

- **상태**: ⏳ 계획됨 (Phase 9)
- **설명**: EVM 체인, Sui 메인넷 호환성
- **현재**: Nasun Devnet만 지원
- **영향**: 급하지 않음 - Devnet 우선 전략

### 4. 세션 지속성 보안

- **상태**: ✅ 구현됨 (기본 비활성화)
- **트레이드오프**: 편의성 vs 최대 보안
- **권장**: 고가치 지갑에서는 비활성화 유지

---

## 버전 정보

| 항목 | 값 |
|------|------|
| 현재 버전 | 0.1.0 (초기 릴리스) |
| 안정성 | ✅ Production-ready |
| 패키지 타입 | 워크스페이스 전용 (private) |
| React 지원 | 18.x / 19.x |
| Sui SDK | ^1.45.2 |

---

## 사용 예시

### 기본 설정

```typescript
import { configureWallet, WalletProvider } from '@nasun/wallet-ui';

// RPC URL 설정 (앱 시작 시)
configureWallet({
  rpcUrl: 'https://rpc.devnet.nasun.io',
  faucetUrl: 'https://faucet.devnet.nasun.io',
});

// Provider로 앱 감싸기
function App() {
  return (
    <WalletProvider>
      <MyApp />
    </WalletProvider>
  );
}
```

### 지갑 상태 사용

```typescript
import { useWallet, useBalance } from '@nasun/wallet';

function WalletStatus() {
  const { status, account } = useWallet();
  const { data: balance } = useBalance();

  if (status === 'disconnected') return <p>지갑 없음</p>;
  if (status === 'locked') return <p>잠김</p>;

  return (
    <div>
      <p>주소: {account?.address}</p>
      <p>잔액: {balance} NASUN</p>
    </div>
  );
}
```

### 멀티 토큰 지원

```typescript
import { registerToken, useMultiBalance } from '@nasun/wallet';

// 커스텀 토큰 등록
registerToken({
  symbol: 'NXYZ',
  name: 'My Token',
  coinType: '0x...::nxyz::NXYZ',
  decimals: 9,
  iconUrl: 'https://...',
});

// 모든 토큰 잔액 조회
const { data: balances } = useMultiBalance();
```

---

이 지갑 패키지는 나선 모노레포의 여러 앱에서 공통으로 사용되며, 블록체인 상호작용을 위한 견고한 기반을 제공합니다.
