# Voting Power V2

Governance 투표 시 사용자의 voting power 계산 로직.
Battalion NFT allowlist 등록 여부를 포함한 다중 소스 기반 가중치 시스템.

## 계산 공식

```
Total = max(1, Base + Leaderboard + OnChain + BattalionBonus + GenesisBonus + XLinkBonus)
```

| 항목 | 계산 방식 | 기본값 |
|------|----------|--------|
| Base | 고정 1 | 1 |
| Leaderboard | `floor(log2(1 + score) * LEADERBOARD_WEIGHT)` | weight=8 |
| On-Chain Activity | `floor(log2(1 + score) * ONCHAIN_WEIGHT)` | weight=8 |
| Battalion Allowlist | 고정 가산 (등록 시) | +20 |
| Genesis Allowlist | 고정 가산 (등록 시) | +20 |
| X Account Linked | 고정 가산 (연결 시) | +10 |

Log compression 함수:

```typescript
function normalizeScore(rawScore: number, weight: number): number {
  if (rawScore <= 0) return 0;
  return Math.floor(Math.log2(1 + rawScore) * weight);
}
```

큰 점수 차이를 압축하면서 비례성을 유지한다.
예: score 100 -> `floor(log2(101) * 8)` = `floor(6.66 * 8)` = 53

## Battalion NFT Allowlist 보너스

### 동작 방식

Battalion NFT allowlist에 **ACTIVE** 상태로 등록된 사용자는 **고정 +20** voting power를 받는다.
승수(multiplier)가 아니라 가산(additive bonus).

### 데이터 흐름

```
1. 프론트엔드 (VotingPowerSummary.tsx)
   ethAddress = userProfile?.linkedAccounts?.metamask?.walletAddress
   fetchVotingPower(twitterHandle, walletAddress, ethAddress) 호출

2. Lambda (governance-api)
   POST /certificate 또는 GET /voting-power 요청 수신
   checkBattalionAllowlist(ethAddress) 호출

3. DynamoDB 조회
   테이블: nasun-nft-whitelist
   PK: walletAddress (Ethereum 주소, 소문자 정규화)
   조건: result.Item?.status === "ACTIVE"

4. Voting Power 계산
   isOnBattalionAllowlist === true  -> +20
   isOnBattalionAllowlist === false -> +0
```

### 주요 특성

- **Ethereum 주소 기반**: Sui 주소가 아닌 MetaMask 지갑 주소로 조회
- **ACTIVE 상태만 인정**: WITHDRAWN(철회) 상태는 미등록 취급, 보너스 없음
- **환경 변수로 조정 가능**: `BATTALION_ALLOWLIST_BONUS` (기본값 20)

## Genesis (Frontiers) Whitelist 보너스

Battalion과 동일한 구조로 **고정 +20** 보너스.

| 항목 | Battalion | Genesis |
|------|-----------|---------|
| DynamoDB 테이블 | `nasun-nft-whitelist` | `GenesisNftWhitelist` |
| 환경 변수 | `BATTALION_ALLOWLIST_BONUS` | `GENESIS_ALLOWLIST_BONUS` |
| 기본 보너스 | +20 | +20 |
| UI 표시 | 활성화 | 주석 처리 (비공개 상태) |

두 보너스는 독립적으로 적용되며, 둘 다 등록되어 있으면 +40.

## 기타 Voting Power 소스

### Leaderboard Bonus

X(Twitter) 계정을 연결한 사용자의 Leaderboard V3 시즌 점수 기반.

- Leaderboard V3 DynamoDB 테이블에서 활성 시즌 점수 조회
- Raw score에 log compression 적용: `floor(log2(1 + score) * 8)`
- X 계정 미연결 시 0

### On-Chain Activity

Nasun Devnet에서의 사용자 활동 기반.

| 활동 | 점수 공식 |
|------|----------|
| DEX (DeepBook) 거래 | `sqrt(txCount) * 3` |
| Lottery 참여 | `sqrt(ticketCount) * 2` |
| Prediction Market | `sqrt(positionCount) * 4` |
| Lending | `sqrt(depositCount) * 3` |
| Baram AI | `sqrt(receiptCount) * 5` |
| 이전 투표 참여 | `voteNFTCount * 8` (선형) |

Raw score 합산 후 log compression: `floor(log2(1 + totalScore) * 8)`
10분 캐시 (LRU, 최대 1000 항목).

### X Account Linked Bonus

X(Twitter) 계정을 연결한 사용자에게 **고정 +10**.

## Certificate 발급 및 온체인 검증

### 발급 흐름

```
1. 프론트엔드: POST /api/governance/certificate 요청
   - voter (Sui 주소), proposalId, twitterHandle, walletAddress, ethAddress

2. Lambda: Voting power 계산 (위 공식)

3. Lambda: Ed25519 서명 생성
   메시지 = domain_separator(26B) || voter(32B) || proposal_id(32B)
            || voting_power(8B BE) || expires_at(8B BE)
   서명 키: AWS Secrets Manager의 Oracle private key

4. Certificate 반환
   - voter, proposalId, votingPower, expiresAt, signature, breakdown
```

### 투표 실행

```
1. Move 트랜잭션 구성
   - mint_certificate(): VotingPowerCertificate 객체 생성
   - vote_with_certificate(): certificate 소비 + 투표 기록

2. 투표 유형에 따른 처리
   - Poll: 스폰서가 가스비 부담 (POST /api/governance/sponsor)
   - Governance: 사용자가 가스비 직접 부담

3. Move 컨트랙트 검증
   - Oracle 공개키로 서명 검증
   - Certificate 만료 확인 (devnet 15분, mainnet 30분)
   - 투표자 = 트랜잭션 발신자 확인
   - Certificate 1회 사용 후 소각 (삭제)

4. 온체인 기록
   - Proposal 객체의 vote_count_yes/no, total_power_yes/no 업데이트
   - voters 테이블에 (votingPower, timestamp) 기록
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `LEADERBOARD_WEIGHT` | 8 | Leaderboard 점수 log weight |
| `ONCHAIN_WEIGHT` | 8 | On-chain 활동 log weight |
| `BATTALION_ALLOWLIST_BONUS` | 20 | Battalion NFT allowlist 고정 보너스 |
| `GENESIS_ALLOWLIST_BONUS` | 20 | Genesis whitelist 고정 보너스 |
| `X_LINK_BONUS` | 10 | X 계정 연결 고정 보너스 |
| `BATTALION_TABLE_NAME` | nasun-nft-whitelist | Battalion allowlist DynamoDB 테이블 |
| `GENESIS_TABLE_NAME` | GenesisNftWhitelist | Genesis whitelist DynamoDB 테이블 |

## 핵심 코드 위치

| 파일 | 역할 |
|------|------|
| `apps/nasun-website/cdk/lambda-src/governance-api/src/index.ts:523-536` | `checkBattalionAllowlist()` - DynamoDB 조회 |
| `apps/nasun-website/cdk/lambda-src/governance-api/src/index.ts:538-551` | `checkGenesisWhitelist()` - DynamoDB 조회 |
| `apps/nasun-website/cdk/lambda-src/governance-api/src/index.ts:583-619` | `normalizeScore()` + `calculateVotingPowerV2()` |
| `apps/nasun-website/frontend/src/features/governance/components/VotingPowerSummary.tsx` | Voting power breakdown UI |
| `apps/nasun-website/frontend/src/features/governance/hooks/useVotingPower.ts` | API 호출 hook |
| `apps/nasun-website/frontend/src/features/governance/hooks/useDirectVote.ts` | Governance 투표 hook |
| `apps/nasun-website/frontend/src/features/governance/hooks/useSponsoredVote.ts` | Poll 스폰서 투표 hook |
| `apps/nasun-website/contracts/governance/sources/voting_power.move` | 온체인 certificate 검증 |
| `apps/nasun-website/cdk/lib/common-stack.ts:293-333` | CDK 인프라 정의 |
