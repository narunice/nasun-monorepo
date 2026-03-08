# Handoff: 나선 지갑 로그인 기능 구현 계획

**생성**: 2026-03-06
**브랜치**: main
**이전 핸드오프**: 없음

---

## 현재 상태 요약

나선 웹사이트에 "나선 지갑(Nasun Wallet)" 로그인을 추가하는 전체 설계 및 연구가 완료되었다.
플랜 파일(`/home/naru/.claude/plans/fancy-floating-ocean.md`)이 확정되었으며, 아직 코드 구현은 시작하지 않았다.
ZkLoginUsers 테이블의 긴급 버그픽스(removalPolicy DESTROY → RETAIN)도 이번 작업에 포함된다.

---

## 완료된 작업

- [x] 나선 지갑 인증 방식 설계 (challenge-response, Ed25519, Cognito Developer Identity)
- [x] Sui wallet dapp-kit best practice 조사 (외부 지갑 vs 인앱 지갑 구분)
- [x] 기존 auth-metamask Lambda 코드 패턴 분석 (재사용 범위 확정)
- [x] `@nasun/wallet` 패키지 API 확인 (`useWallet().status`, `useSigner().signer.signPersonal`)
- [x] AuthProvider.tsx `signInWithWallet()` 재사용 가능성 확인
- [x] UI 배치 전략 확정 (Navbar 독립 버튼 — SignUpModal 외부)
- [x] 나선 에코시스템 비전 연구 (on-chain score × NFT staking → mainnet airdrop 기술 타당성 7/10)
- [x] 보안 체크리스트 완성 (nonce TTL, replay 방지, cross-chain 방지 등)
- [x] 플랜 파일 최종 작성 완료

## 미완료 작업 (구현 순서대로)

- [ ] **[긴급]** `cdk/lib/auth-stack.ts` — ZkLoginUsers removalPolicy DESTROY → RETAIN 수정
- [ ] `cdk/lambda-src/auth-sui/` Lambda 소스 파일 생성 (index.ts, handlers/, utils/)
- [ ] `cdk/lambda-src/auth-sui/package.json` + `tsconfig.json` 생성
- [ ] `cdk/lib/auth-stack.ts` — SuiAuth Lambda + 새 API GW + IAM 추가
- [ ] `frontend/src/services/suiWalletApi.ts` 생성
- [ ] `frontend/src/features/wallet/hooks/useNasunWalletAuth.ts` 생성
- [ ] `frontend/src/features/auth/components/NasunWalletNavButton.tsx` 생성
- [ ] `frontend/src/components/navbar/Navbar.tsx` — NasunWalletNavButton 추가
- [ ] `frontend/src/features/auth/providers/AuthProvider.tsx` — username truncation 수정
- [ ] CDK deploy + 환경변수 설정 (`VITE_ENABLE_NASUN_WALLET_LOGIN`, `VITE_SUI_WALLET_AUTH_API`)

---

## 중요 컨텍스트

### 아키텍처 결정사항

**인증 플로우**:
```
[NasunWalletNavButton 클릭]
    ↓
POST /auth/sui/prepare → { nonce, message }
    ↓
signer.signPersonal(new TextEncoder().encode(message)) → { signature: base64 }
    ↓
POST /auth/sui/connect-verify { signature, nonce }
    ↓ verifyPersonalMessageSignature(msgBytes, sig) → publicKey.toSuiAddress()
    ↓ Cognito developer identity: "nasun_${walletAddress}"
→ { walletAddress, identityId, token }
    ↓
AuthContext.signInWithWallet(identityId, token, walletAddress, "Nasun Wallet")
```

**주의사항**:
- Cognito identifier prefix: `nasun_` (NOT `sui_`) — MetaMask의 `metamask_` 패턴과 일관성
- Sui 주소 형식: `0x` + 64 hex chars (vs EVM 0x + 40 chars)
- Signature: base64 string (Sui), NOT hex (EVM)
- `verifyPersonalMessageSignature`: throws on failure, returns PublicKey (NOT address directly)
- 각 auth method는 독립 RestApi 객체 사용 (기존 codebase 패턴)
- `MetaMaskAuthNonces` 테이블 재사용, key prefix `suiPrepare:` (vs MetaMask `prepare:`)

**긴급 버그**: `ZkLoginUsers` 테이블 removalPolicy = DESTROY → `cdk destroy` 시 모든 zkLogin 사용자의 salt(= Sui 주소 결정 데이터)가 영구 삭제됨. 반드시 RETAIN으로 수정.

**AuthProvider.tsx username 버그**: `substring(38)` hardcoded for EVM 42-char addresses. Sui address는 66자 → `substring(walletAddress.length - 4)` 로 수정 필요.

### 기존 코드 재사용 맵

| 기존 파일 | auth-sui 대응 | 변경 내용 |
|-----------|-------------|---------|
| `auth-metamask/src/handlers/prepare.ts` | `auth-sui/src/handlers/prepare.ts` | key prefix `suiPrepare:`, "(Sui)" 메시지 |
| `auth-metamask/src/handlers/connect-verify.ts` | `auth-sui/src/handlers/connect-verify.ts` | ecrecover → verifyPersonalMessageSignature, identifier prefix |
| `auth-metamask/src/utils/cognito.ts` | `auth-sui/src/utils/cognito.ts` | `nasun_` prefix |
| `auth-metamask/src/utils/dynamodb.ts` | `auth-sui/src/utils/dynamodb.ts` | 그대로 복사 |
| `auth-metamask/src/utils/userProfile.ts` | `auth-sui/src/utils/userProfile.ts` | provider "Nasun Wallet", username substring 수정 |
| `auth-metamask/src/utils/log-utils.ts` | `auth-sui/src/utils/log-utils.ts` | 그대로 복사 |
| `auth-metamask/src/utils/wallet-proof.ts` | `auth-sui/src/utils/wallet-proof.ts` | 그대로 복사 |

### 프론트엔드 핵심 파일 경로

- `packages/wallet/src/index.ts` — `useWallet`, `useSigner` 훅 export 확인 완료
- `frontend/src/features/auth/providers/AuthProvider.tsx` — `signInWithWallet()` 재사용
- `frontend/src/features/wallet/hooks/useWalletAuth.ts` — EVM 지갑 (수정 안 함, 참고용)
- `frontend/src/components/auth/SignUpModal.tsx` — 수정 안 함

### 환경 변수

| 변수 | 위치 | 설명 |
|------|------|------|
| `VITE_ENABLE_NASUN_WALLET_LOGIN` | frontend `.env` | feature flag |
| `VITE_SUI_WALLET_AUTH_API` | frontend `.env` | SuiAuthApiUrl (CDK output) |

---

## 주요 파일 위치

```
# Lambda
apps/nasun-website/cdk/lambda-src/auth-metamask/   ← 패턴 참조
apps/nasun-website/cdk/lambda-src/auth-sui/         ← 신규 생성
apps/nasun-website/cdk/lib/auth-stack.ts            ← SuiAuth 추가 + ZkLoginUsers RETAIN 수정

# Frontend
apps/nasun-website/frontend/src/services/suiWalletApi.ts              ← 신규
apps/nasun-website/frontend/src/features/wallet/hooks/useNasunWalletAuth.ts  ← 신규
apps/nasun-website/frontend/src/features/auth/components/NasunWalletNavButton.tsx ← 신규
apps/nasun-website/frontend/src/components/navbar/Navbar.tsx           ← 수정
apps/nasun-website/frontend/src/features/auth/providers/AuthProvider.tsx ← 수정(username 버그)
```

---

## 나선 에코시스템 비전 (참고)

이 로그인 기능은 더 큰 비전의 첫 단계:

1. **지금**: 나선 지갑으로 웹사이트 계정 생성 → Cognito identityId 발급
2. **다음 스텝 (별도 작업)**: 온체인 활동 점수 누적 (DynamoDB atomic counter, EventKey deduplication으로 devnet reset 내성)
3. **이후**: NFT soft staking (shared object registry, no transfer needed) × 점수 멀티플라이어
4. **메인넷**: Merkle tree airdrop, `log(score+1) × NFT_multiplier`, 지갑당 5% cap

NFT 스테이킹 컨트랙트는 아직 미배포. 온체인 스코어 Lambda/이벤트 인덱서도 별도 작업으로 분리.

---

## 즉시 다음 단계

1. **[지금 당장]** `cdk/lib/auth-stack.ts` 열어서 ZkLoginUsers removalPolicy 한 줄 수정 (`DESTROY` → `RETAIN`)
2. `auth-sui` Lambda 디렉토리 생성 및 소스 파일 작성 (auth-metamask 패턴 복사 + 수정)
3. `auth-stack.ts`에 SuiAuth Lambda + RestApi + IAM 추가
4. 프론트엔드: `suiWalletApi.ts` → `useNasunWalletAuth.ts` → `NasunWalletNavButton.tsx` → `Navbar.tsx`
5. `AuthProvider.tsx` username substring 수정
6. CDK deploy → SuiAuthApiUrl → frontend .env 업데이트
