# 나선 월렛 개선 계획서

> 작성일: 2025-12-28
> 버전: 1.1
> 최종 수정: 2025-12-28

## 진행 상태

| Phase | 상태 | 완료일 |
|-------|------|--------|
| **Phase 1** | ✅ 완료 | 2025-12-28 |
| Phase 2 | ⏳ 대기 | - |
| Phase 3 | ⏳ 대기 | - |
| Phase 4 | ⏳ 대기 | - |
| Phase 5 | ⏳ 대기 | - |
| Phase 6 | ⏳ 대기 | - |
| Phase 7 | ⏳ 대기 | - |

---

## 개요

나선 월렛(@nasun/wallet, @nasun/wallet-ui)을 2025년 웹3 지갑 트렌드에 맞게 단계적으로 개선하는 계획입니다.

### 현재 구현 상태 요약

| 영역 | 완료 | 미완료 |
|------|------|--------|
| **@nasun/wallet** | 지갑 생성/복구, 잠금/해제, NASUN 전송, 잔액 조회, Faucet, 세션 지속성 | 다중 토큰 TX, 다중 지갑, 스테이킹, zkLogin, 테스트 |
| **@nasun/wallet-ui** | WalletConnect, BalanceDisplay, SendTransaction, TokenSelector 등 9개 컴포넌트 | 멀티토큰 전송 UI, 애니메이션, i18n, 테스트 |

### 설계 원칙

1. **나선 전용 우선**: 현재는 나선 네트워크만 지원, 멀티체인은 장기 로드맵
2. **Pado와의 역할 분리**: 월렛은 인프라, Pado는 슈퍼앱
3. **점진적 구현**: 테스트 기반 안정성 확보 후 기능 추가
4. **스테이킹 내장**: 기본 스테이킹 기능은 월렛에서 제공

---

## Phase 1: 품질 기반 강화 (Foundation) ✅

**상태**: 완료 (2025-12-28)
**목표**: 테스트 커버리지 확보로 향후 개발 안정성 보장

### 구현 결과
- **@nasun/wallet**: 76개 테스트 통과
  - `tokens.test.ts`: 15개 (토큰 레지스트리)
  - `client.test.ts`: 26개 (유틸리티 함수)
  - `crypto.test.ts`: 15개 (암호화)
  - `keystore.test.ts`: 17개 (키스토어)
  - `sanity.test.ts`: 3개 (인프라 검증)
- **@nasun/wallet-ui**: 15개 테스트 통과
  - `BalanceDisplay.test.tsx`: 12개
  - `sanity.test.tsx`: 3개 (인프라 검증)

### 구현 기능

1. **단위 테스트 (vitest)**
   - `crypto.ts`: 암호화/복호화 정확성
   - `keystore.ts`: 지갑 생성/복구/잠금 플로우
   - `tokens.ts`: 토큰 레지스트리 CRUD
   - `client.ts`: 잔액 포맷팅/파싱

2. **통합 테스트**
   - 지갑 생성 → 잠금 → 해제 플로우
   - 트랜잭션 서명 (mock RPC)

3. **컴포넌트 테스트 (React Testing Library)**
   - WalletConnect 인터랙션
   - SendTransaction 검증

### 수정/생성 파일

```
packages/wallet/
  vitest.config.ts                    (신규)
  src/__tests__/
    setup.ts                          (신규)
    crypto.test.ts                    (신규)
    keystore.test.ts                  (신규)
    tokens.test.ts                    (신규)
    client.test.ts                    (신규)
  package.json                        (수정 - vitest, @testing-library 추가)

packages/wallet-ui/
  vitest.config.ts                    (신규)
  src/__tests__/
    setup.tsx                         (신규)
    WalletConnect.test.tsx            (신규)
    SendTransaction.test.tsx          (신규)
  package.json                        (수정)
```

**복잡도**: Medium
**예상 기간**: 1-2주

---

## Phase 2: 다중 토큰 전송 완성

**목표**: 현재 조회만 가능한 멀티토큰을 전송까지 지원 (NBTC, NUSDC 등)

### 구현 기능

1. **useTokenTransaction 훅**
   - `sendTokenTransaction(tokenType, to, amount)` 함수
   - 토큰 타입별 coin object 조회 및 split/transfer

2. **SendTransaction UI 개선**
   - TokenSelector 통합 (현재 분리됨)
   - 선택된 토큰 잔액 실시간 표시
   - 가스비(NASUN) 잔액 부족 시 경고

3. **트랜잭션 결과 개선**
   - 토큰 심볼 표시
   - Explorer 링크 제공

### 수정/생성 파일

```
packages/wallet/
  src/hooks/useTokenTransaction.ts    (신규)
  src/hooks/useTransaction.ts         (수정 - 기존 로직 리팩토링)
  src/sui/transaction.ts              (신규 - 토큰별 TX 로직)
  src/types/index.ts                  (수정 - TokenTransactionRequest)

packages/wallet-ui/
  src/SendTransaction.tsx             (수정 - TokenSelector 통합)
  src/index.ts                        (수정 - export 추가)
```

**복잡도**: Medium
**의존성**: Phase 1
**예상 기간**: 1주

---

## Phase 3: 스테이킹 기능

**목표**: 지갑 내에서 기본 스테이킹 지원 (Validator 위임)

### 구현 기능

1. **스테이킹 훅**
   - `useStaking()`: 현재 스테이킹 상태 조회
   - `useStake()`: 스테이킹 실행
   - `useUnstake()`: 언스테이킹 실행
   - `useClaimRewards()`: 리워드 클레임

2. **Validator 조회**
   - Validator 목록 조회
   - APY, 커미션, 위임량 표시

3. **스테이킹 UI**
   - `StakingPanel`: 스테이킹 메인 패널
   - `ValidatorList`: Validator 선택 UI
   - `StakingStatus`: 현재 스테이킹 상태 표시

### 수정/생성 파일

```
packages/wallet/
  src/hooks/useStaking.ts             (신규)
  src/hooks/useValidators.ts          (신규)
  src/sui/staking.ts                  (신규 - 스테이킹 RPC 호출)
  src/types/staking.ts                (신규)
  src/index.ts                        (수정 - export)

packages/wallet-ui/
  src/StakingPanel.tsx                (신규)
  src/ValidatorList.tsx               (신규)
  src/StakingStatus.tsx               (신규)
  src/index.ts                        (수정)
```

**복잡도**: High
**의존성**: Phase 1
**예상 기간**: 2주

---

## Phase 4: 다중 지갑 지원

**목표**: 하나의 앱에서 여러 지갑 계정 관리

### 구현 기능

1. **Keystore 구조 변경**
   ```typescript
   interface KeystoreManager {
     keystores: EncryptedKeystore[];
     activeIndex: number;
     metadata: WalletMeta[];
   }

   interface WalletMeta {
     name: string;
     createdAt: number;
     lastUsedAt: number;
     color?: string;
   }
   ```

2. **다중 지갑 관리**
   - 지갑 추가/삭제
   - 활성 지갑 전환
   - 지갑 이름 변경

3. **UI 확장**
   - `WalletSelector`: 지갑 선택 드롭다운
   - `WalletSettings`: 지갑별 설정

### 수정/생성 파일

```
packages/wallet/
  src/core/keystoreManager.ts         (신규)
  src/core/keystore.ts                (수정 - 대규모 리팩토링)
  src/hooks/useWallets.ts             (신규 - 다중 지갑 목록)
  src/hooks/useWallet.ts              (수정 - 활성 지갑 관리)
  src/types/index.ts                  (수정 - WalletMeta)

packages/wallet-ui/
  src/WalletSelector.tsx              (신규)
  src/WalletSettings.tsx              (신규)
  src/WalletConnect.tsx               (수정)
```

**복잡도**: High
**의존성**: Phase 1, 2
**예상 기간**: 2-3주

---

## Phase 5: zkLogin 통합

**목표**: 소셜 로그인으로 시드리스 온보딩 (Sui 네이티브 zkLogin 활용)

### 선행 조건
- [ ] Nasun Devnet zkLogin 지원 확인 (Sui mainnet 1.63.0+ 포크 기준)
- [ ] ZK proof 생성 서버 준비 (자체 운영 또는 Mysten 프로버)
- [ ] OAuth 클라이언트 ID 등록 (Google, Apple)

### 구현 기능

1. **zkLogin Provider**
   - Google, Apple OAuth 연동
   - Ephemeral keypair 생성/관리
   - ZK proof 생성 및 검증

2. **세션 관리**
   - OAuth 토큰 갱신
   - Ephemeral 키 만료 처리

3. **기존 지갑과 연동**
   - zkLogin 계정에 기존 지갑 연결
   - 복구 옵션 제공

### 수정/생성 파일

```
packages/wallet/
  src/core/zkLogin.ts                 (신규)
  src/hooks/useZkLogin.ts             (신규)
  src/providers/OAuthProvider.ts      (신규)
  src/types/zkLogin.ts                (신규)

packages/wallet-ui/
  src/ZkLoginConnect.tsx              (신규)
  src/OAuthButton.tsx                 (신규)
  src/WalletConnect.tsx               (수정 - zkLogin 옵션 추가)
```

**복잡도**: Very High
**의존성**: Phase 1-4 + Nasun Devnet zkLogin 지원
**예상 기간**: 3-4주

---

## Phase 6: Pado 통합 최적화 (장기)

**목표**: Pado 앱과의 심층 통합, Unified Onchain Finance 비전 지원

### 구현 기능

1. **Smart Account 연동**
   - Pado BalanceManager와 연결
   - 통합 잔액 조회 (지갑 + 거래소 마진)

2. **트랜잭션 배치**
   - 복수 트랜잭션 한 번에 서명
   - 가스비 최적화

3. **Wallet Standard**
   - 외부 dApp 연결 표준 구현
   - Nasun dApp 생태계 지원

4. **활동 피드**
   - 거래/전송/스테이킹 통합 히스토리
   - 알림 시스템

### 수정/생성 파일

```
packages/wallet/
  src/integrations/pado.ts            (신규)
  src/hooks/useBatchTransaction.ts    (신규)
  src/standard/walletStandard.ts      (신규)

packages/wallet-ui/
  src/ActivityFeed.tsx                (신규)
  src/UnifiedBalance.tsx              (신규)
```

**복잡도**: Medium-High
**의존성**: Phase 1-5, Pado Phase 7+ 진행 상황
**예상 기간**: 지속적

---

## Phase 7: 멀티체인 확장 (장기)

**목표**: Sui mainnet, EVM 등 다른 체인 연동

### 고려 사항
- 현재는 나선 전용으로 구현
- 장기적으로 Sui mainnet 호환성 유지
- EVM 체인 연동은 브릿지 구축 후 검토

---

## 구현 우선순위 요약

| 순위 | Phase | 이유 |
|------|-------|------|
| 1 | Phase 1 (테스트) | 모든 후속 작업의 안전망 |
| 2 | Phase 2 (멀티토큰 TX) | Pado 즉시 활용 가능 |
| 3 | Phase 3 (스테이킹) | 사용자 요구사항, 독립적 구현 가능 |
| 4 | Phase 4 (다중 지갑) | 사용자 경험 개선 |
| 5 | Phase 5 (zkLogin) | Nasun Devnet 지원 확인 후 |
| 6 | Phase 6 (Pado 통합) | Pado 개발과 병행 |
| 7 | Phase 7 (멀티체인) | 장기 로드맵 |

---

## Perplexity 제안 비판 및 수정

| 원래 제안 | 문제점 | 수정 |
|-----------|--------|------|
| Phase 1: Core MVP | 이미 대부분 완료됨 | → 테스트 코드 추가로 변경 |
| Phase 2: 멀티체인 & 소셜 온보딩 | 나선은 단일 체인, 멀티체인은 시기상조 | → 멀티토큰 TX + 스테이킹으로 분리 |
| Phase 3: SocialFi 슈퍼앱화 | Pado가 슈퍼앱 역할 | → 월렛은 인프라로 유지 |
| Phase 4: MPC, 조직 계정, 플러그인 | 과도한 범위 | → zkLogin만 우선, MPC는 보류 |

---

## 핵심 파일 목록

### @nasun/wallet
- `packages/wallet/src/hooks/useWallet.ts` - 핵심 상태 관리
- `packages/wallet/src/core/keystore.ts` - 키 저장소
- `packages/wallet/src/hooks/useTransaction.ts` - 트랜잭션
- `packages/wallet/src/types/index.ts` - 타입 정의

### @nasun/wallet-ui
- `packages/wallet-ui/src/WalletConnect.tsx` - 메인 UI
- `packages/wallet-ui/src/SendTransaction.tsx` - 전송 UI
- `packages/wallet-ui/src/TokenSelector.tsx` - 토큰 선택

---

## 참고 자료

### 2025 웹3 지갑 트렌드
- [Alchemy Web3 Wallets Guide](https://www.alchemy.com/overviews/web3-wallets)
- [Lampros Tech Web3 Wallets 2025](https://lampros.tech/blogs/best-web3-wallets-2025)
- [RocknBlock Wallet Trends](https://rocknblock.io/blog/top-web3-wallet-development-trends-to-watch)

### Sui zkLogin
- [Sui zkLogin Docs](https://docs.sui.io/concepts/cryptography/zklogin)
- [zkLogin Integration Guide](https://docs.sui.io/guides/developer/cryptography/zklogin-integration)

### 계정 추상화
- [Sui Account Abstraction](https://blog.sui.io/account-abstraction-explained/)
- [CoinChapter Smart Wallets 2025](https://coinchapter.com/best-smart-wallets-in-2025-the-account-abstraction-revolution/)
