# ZK 기반 완전 익명 투표 시스템 - 조사/설계 문서

> 작성일: 2026-03-20
> 상태: 조사 완료, 구현 미착수

---

## 1. 문제 정의

### 현재 거버넌스 투표의 프라이버시 문제

nasun-website 거버넌스 투표는 on-chain에 `voters: Table<address, VoteRecord>`로
투표자의 지갑 주소와 투표 내용(Yes/No, voting power)이 직접 기록된다.

**추적 경로:**

```
On-chain                          Off-chain (DynamoDB)
---------                         --------------------
Proposal.voters                   UserWallets 테이블
  address -> VoteRecord             walletAddress -> ownerIdentityId
    vote_yes: bool                UserProfiles 테이블
    voting_power: u64               identityId -> twitterHandle
```

- **일반 사용자**: on-chain에서 "0x... 주소가 Yes에 투표했다"는 볼 수 있지만,
  그 주소가 누구인지는 알기 어려움 (DynamoDB 접근 불가)
- **Admin**: on-chain 투표 기록 + DynamoDB 지갑-X계정 매핑을 조합하면
  **누가 어디에 투표했는지 완전히 추적 가능**

### 목표

Admin 포함 누구도 개별 투표 내용을 추적할 수 없는 **완전 익명 투표** 구현.

---

## 2. 접근법 비교

| 접근법 | 일반 사용자로부터 보호 | Admin으로부터 보호 | 난이도 | 비고 |
|--------|----------------------|-------------------|--------|------|
| Oracle 대리 투표 | O | X | 낮음 | Oracle(Admin)이 투표 내용을 알고 있음 |
| 1회용 임시 주소 | O | X | 중간 | Oracle이 certificate 발급 시 매핑 가능 |
| Commit-Reveal | O | 부분적 | 중간 | 공개 단계에서 결국 투표 내용 노출 |
| **ZK 익명 투표** | **O** | **O** | **높음** | **Commitment-Nullifier 방식, 진정한 프라이버시** |

**결론**: 완전 익명을 위해서는 ZK 기반 솔루션이 필수.

---

## 3. 활용 가능한 기존 인프라

### 3.1 `sui::groth16` (네이티브 Move 모듈)

On-chain에서 Groth16 proof를 직접 검증할 수 있는 네이티브 모듈.

```
위치: governance/build/.../dependencies/Sui/groth16.move
지원 곡선: BLS12-381 (id=0), BN254 (id=1)
Public inputs: 최대 8개 (32바이트 스칼라 필드)

핵심 함수:
- prepare_verifying_key(curve, verifying_key) -> PreparedVerifyingKey
- verify_groth16_proof(curve, pvk, public_inputs, proof_points) -> bool
- public_proof_inputs_from_bytes(bytes) -> PublicProofInputs
- proof_points_from_bytes(bytes) -> ProofPoints
```

### 3.2 `sui::poseidon` (네이티브 Move 모듈)

ZK-friendly hash 함수. BN254 curve의 scalar field에서 동작.

```
위치: governance/build/.../dependencies/Sui/poseidon.move
지원: BN254 Poseidon hash, 최대 16개 input
BN254 field size: 21888242871839275222246405745257275088548364400416034343698204186575808495617

핵심 함수:
- poseidon_bn254(data: &vector<u256>) -> u256
```

### 3.3 zkLogin Prover

```
URL: https://rpc.devnet.nasun.io/zkprover/v1
방식: Groth16 (자체 호스팅)
용도: zkLogin 인증용 (익명 투표와는 별도 circuit)
```

**주의**: zkLogin prover의 circuit과 익명 투표 circuit은 완전히 다름.
zkLogin 인프라 운영 경험은 활용 가능하나, 새 circuit에 대한 proving key와 trusted setup이 별도 필요.

### 3.4 ZKID 모듈

```
위치: packages/wallet/src/core/zkid/
설계된 claim types: age_over, kyc_completed, unique_claim, custom
unique_claim에 nullifier 기반 Sybil 저항 개념이 이미 설계됨
```

### 3.5 기존 Governance 시스템

```
Move 컨트랙트: apps/nasun-website/contracts/governance/sources/
  - proposal.move: Yes/No 투표 (Proposal, VoteRecord)
  - multi_choice_proposal.move: 다중 선택 투표
  - voting_power.move: VotingPowerCertificate (Ed25519 Oracle 서명)

백엔드: apps/nasun-website/cdk/lambda-src/governance-api/src/index.ts
  - GET /voting-power: voting power 계산
  - POST /certificate: Oracle 서명 certificate 발급
  - POST /sponsor: 가스비 대납 (Poll 유형)

Voting Power 공식:
  Base(10) + X Link(5) + Telegram(5) + Rank Bonus(10-20)
  최대 40, 최소 10
```

---

## 4. 설계: Commitment-Nullifier 방식

### 4.1 핵심 아이디어

Semaphore 프로토콜과 유사한 Commitment-Nullifier 패턴 사용.

```
commitment = Poseidon(secret, votingPower, voterSalt)
nullifier  = Poseidon(secret, proposalId)
```

| 요소 | 생성 위치 | 공개 여부 | 역할 |
|------|----------|----------|------|
| secret | 브라우저 | 비공개 (서버 전송 금지) | commitment/nullifier의 비밀 시드 |
| voterSalt | 브라우저 | 비공개 | commitment 무작위화 |
| votingPower | 서버 (계산) -> 브라우저 | commitment에 포함 | 투표 가중치 |
| commitment | 브라우저 (계산) | 공개 (Merkle tree leaf) | 투표 자격 등록 |
| nullifier | 브라우저 (투표 시 계산) | 공개 (on-chain) | 이중투표 방지 |

**핵심 성질:**
- commitment에서 voter identity를 역추적할 수 없음 (secret을 모르므로)
- nullifier에서 commitment을 연결할 수 없음 (secret 없이 Poseidon 역산 불가)
- 같은 secret + 같은 proposalId = 같은 nullifier (이중투표 감지)

### 4.2 2-Phase 투표 플로우

```
[Registration Phase]                    [Voting Phase]
등록 기간 (예: 3일)                     투표 기간 (예: 3일)

1. 사용자가 secret 생성 (브라우저)      1. Merkle proof 조회 (API)
2. commitment 계산                      2. ZK proof 생성 (브라우저 WASM, 1-3초)
3. API로 commitment 등록 요청           3. Sponsored tx로 on-chain 제출
4. Oracle이 자격 확인 후 등록           4. Move 컨트랙트가 groth16 검증
5. Merkle tree에 추가                   5. nullifier 중복 체크 후 집계
         |
         v
   Merkle root freeze
   (등록 마감 후 root 확정)
```

**시간 분리가 핵심**: 등록과 투표를 시간적으로 분리하여 timing correlation attack 방지 (상세 분석은 6절 참고).

---

## 5. 기술 설계

### 5.1 ZK Circuit (Circom, BN254)

#### `anonymous_vote.circom`

```
Public Inputs (5개, groth16 제한 8개 이내):
  1. merkleRoot      -- on-chain에 저장된 현재 Merkle root
  2. nullifier       -- 이중투표 방지
  3. proposalId      -- 투표 대상
  4. voteChoice      -- 0=No, 1=Yes
  5. votingPower     -- 투표 power

Private Inputs:
  1. secret          -- 사용자 비밀값
  2. voterSalt       -- commitment salt
  3. merklePath[20]  -- Merkle proof siblings (depth 20)
  4. merkleIndices[20] -- left/right indicators

Constraints:
  1. commitment = Poseidon(secret, votingPower, voterSalt)
  2. MerkleProof(commitment, merklePath, merkleIndices) == merkleRoot
  3. nullifier == Poseidon(secret, proposalId)
  4. voteChoice in {0, 1}
  5. votingPower > 0
```

**성능 추정:**
- Merkle tree depth: 20 (약 100만 leaf, 충분한 여유)
- Poseidon hash: ~300 constraints per hash
- Merkle proof: 20 x Poseidon = ~6,000 constraints
- 총: ~7,000 constraints
- Proving time: 1-3초 (snarkjs WASM, 브라우저)

### 5.2 Move 컨트랙트: `anonymous_proposal.move`

새 파일: `apps/nasun-website/contracts/governance/sources/anonymous_proposal.move`

#### 데이터 구조

```move
public struct AnonymousProposal has key {
    id: UID,
    title: String,
    description: String,
    pvk: groth16::PreparedVerifyingKey,     // Groth16 verification key (circuit별)
    merkle_root: u256,                       // 현재 Merkle root (Poseidon)
    total_power_yes: u64,
    total_power_no: u64,
    vote_count_yes: u64,
    vote_count_no: u64,
    nullifiers: Table<u256, bool>,           // 사용된 nullifier (이중투표 방지)
    commitments: Table<u256, bool>,          // 등록된 commitment (무결성 보장)
    registration_deadline: u64,              // 등록 마감 (timestamp ms)
    voting_deadline: u64,                    // 투표 마감 (timestamp ms)
    creator: address,
    is_active: bool,
}

// 이벤트: voter address 없음 (익명)
public struct AnonymousVoteCast has copy, drop {
    proposal_id: ID,
    nullifier: u256,
    vote_choice: u64,    // 0=No, 1=Yes
    voting_power: u64,
}

public struct CommitmentRegistered has copy, drop {
    proposal_id: ID,
    commitment: u256,
    // NOTE: voter address 없음
}
```

#### 핵심 함수

**`anonymous_vote(proposal, proof_points_bytes, public_inputs_bytes, clock)`**
- `ctx` 파라미터 없음 (sender 추적 방지)
- `groth16::verify_groth16_proof()` 호출로 ZK proof 검증
- public inputs에서 merkle_root, nullifier, proposalId, voteChoice, votingPower 추출
- merkle_root가 proposal의 현재 root와 일치하는지 확인
- nullifier 중복 체크 후 저장
- 투표 집계 (total_power/vote_count 업데이트)

**`register_commitment(proposal, admin_cap, commitment, clock)`**
- AdminCap 필요 (Oracle이 자격 확인 후 호출)
- commitment을 on-chain Table에 등록 (서버의 Merkle tree 변조 방지)

**`update_merkle_root(proposal, admin_cap, new_root)`**
- AdminCap 필요
- 등록 완료 후 Merkle root 확정

### 5.3 백엔드 (governance-api Lambda 확장)

수정 파일: `apps/nasun-website/cdk/lambda-src/governance-api/src/index.ts`

#### 새 엔드포인트

| Endpoint | Method | 설명 |
|----------|--------|------|
| `/anonymous/register-commitment` | POST | commitment 등록 (자격 확인 후) |
| `/anonymous/merkle-proof` | GET | 특정 commitment의 Merkle proof 반환 |
| `/anonymous/sponsor-vote` | POST | 익명 투표 tx sponsor |

#### Commitment 등록 플로우

```
POST /anonymous/register-commitment
Body: { proposalId, commitment, voter }

서버 로직:
1. voter의 voting power 계산 (기존 calculateVotingPower() 재사용)
2. 이중 등록 방지: hash(proposalId + voter) 저장 (voter 원문은 저장하지 않음)
3. commitment을 Merkle tree에 추가 (DynamoDB)
4. On-chain register_commitment 호출 (AdminCap 사용)
5. Merkle root 업데이트
6. voter 정보 즉시 폐기 (메모리에서만 사용, 로그에 기록 금지)

Response: { success: true, leafIndex: 42, votingPower: 25 }
```

#### Merkle Tree 관리

- **저장**: DynamoDB (PK: proposalId, SK: leafIndex)
- **구현**: `circomlibjs`의 `buildPoseidon()` + 자체 Merkle tree
- **root 정합성**: on-chain root와 off-chain 계산 root 일치 검증
- **empty leaf**: Poseidon(0)

#### Sponsor 설계

기존 `/sponsor` 엔드포인트와 유사하나, sender 정보 불필요.
- Rate limiting으로 spam 방지 (IP 기반 또는 captcha)
- Transaction validation: `anonymous_proposal::anonymous_vote` MoveCall만 허용

### 5.4 프론트엔드

#### 새 파일들

| 파일 | 역할 |
|------|------|
| `features/governance/components/AnonymousProposalItem.tsx` | 익명 투표 UI |
| `features/governance/hooks/useAnonymousRegistration.ts` | 등록 플로우 |
| `features/governance/hooks/useAnonymousVote.ts` | ZK proof 생성 + 투표 |
| `features/governance/utils/anonymousVoting.ts` | secret 관리, Poseidon 계산 |

#### Secret 관리

- `secret`, `voterSalt`, `votingPower`를 IndexedDB에 암호화 저장
- Key: proposalId
- Secret은 서버에 절대 전송하지 않음
- 분실 시 투표 불가 (trade-off)

#### WASM Prover 통합

```typescript
// snarkjs WASM prover (브라우저에서 실행)
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  {
    secret, voterSalt, votingPower,
    proposalId, voteChoice,
    merklePath, merkleIndices
  },
  "/circuits/anonymous_vote.wasm",    // ~1-2MB, CDN에서 lazy load
  "/circuits/anonymous_vote.zkey",    // ~5-10MB, CDN에서 lazy load
);
```

- `.wasm`와 `.zkey` 파일은 S3/CDN에 호스팅
- 투표 시에만 다운로드 (lazy load)
- 첫 로드 이후 브라우저 캐시 활용

---

## 6. 보안 분석: 익명성 공격 벡터

### 6.1 타이밍 어택 (Timing Attack)

**정의**: "언제 했는지"를 추적해서 "누가 했는지"를 추론하는 공격.

**시나리오**: 등록과 투표를 동시에 허용하면

```
14:00:01  voter 0xABC가 commitment 등록
14:05:10  익명 투표 1건이 on-chain에 기록

Admin: "14:00에 등록한 사람이 1명뿐이고,
       14:05에 투표한 사람도 1명뿐이네.
       이 투표는 0xABC의 것이겠구나."
```

참여자가 적을수록 이 공격은 더 쉬워진다.

**대응: 2-Phase 시간 분리**

```
[등록 기간: 3일]              [투표 기간: 3일]
                              |
  100명이 각자               |  Merkle root    100명이 각자
  commitment을              |  확정 (freeze)   투표를 제출
  등록                       |
                              |
  이 기간에는                |  이 시점 이후    투표 시점을 봐도
  투표 불가                  |  등록 불가       100명 중 누군지 모름
```

Registration Phase와 Voting Phase를 시간적으로 완전히 분리.
N명이 이미 등록되어 있으므로, 투표 시점을 봐도 N명 중 누구인지 특정 불가.

### 6.2 Voting Power Fingerprint

**문제**: 현재 voting power 공식이 `Base(10) + X Link(5) + Telegram(5) + Rank Bonus(10-20)` 이므로,
rank bonus가 사람마다 다르면 power 값 자체가 개인 식별자(fingerprint)가 된다.

**예시**:
```
등록 로그                    on-chain 투표 기록
voter 0xABC: power 37       nullifier#77: power 37, Yes
voter 0xDEF: power 22       nullifier#99: power 22, No

Admin: "power 37인 사람은 0xABC뿐. Yes 투표는 0xABC겠구나."
```

**대응 옵션 (미결정)**:

| 옵션 | 장점 | 단점 |
|------|------|------|
| 동일 weight (1인 1표) | 가장 강한 익명성 | Power 차별화 의미 없어짐 |
| 구간별 정규화 (예: 10-20->15, 21-30->25) | 부분적 익명성 | 동일 구간 내에서만 보호 |
| 현행 유지 | 구현 단순 | fingerprint 위험 존재 |

### 6.3 서버 로그 기반 추적

**문제**: commitment 등록 시 서버가 voter 자격을 확인하므로,
로그에 "voter A -> commitment X" 매핑이 남을 수 있음.

commitment에서 nullifier를 직접 연결할 수는 없지만 (secret을 모르므로),
power fingerprint와 조합하면 추론 가능.

**대응**:
- voter 정보는 자격 확인 후 즉시 폐기 (메모리에서만 사용)
- 이중 등록 방지: `hash(proposalId + voter)` 저장 (voter 원문 복구 불가)
- 서버 로그에 voter address 기록 금지
- Lambda 로그 레벨 조정 (commitment 등록 시 voter 정보 출력하지 않음)

### 6.4 Sponsored Transaction Sender 노출

**문제**: on-chain 트랜잭션에는 gas payer(sender)가 기록됨.
사용자가 직접 제출하면 주소가 노출.

**대응**: 반드시 sponsored transaction 사용.
- Sponsor 주소가 gas를 대납하므로 사용자 주소가 노출되지 않음
- ZK proof에 sender 정보가 포함되지 않으므로, sponsor가 대리 제출해도 안전

### 6.5 보안 위협 요약

| 위협 | 대응 | 타이밍 어택 방지 없이 Admin 추적 가능? |
|------|------|--------------------------------------|
| 타이밍 대조 | 2-Phase 시간 분리 | O (시간 대조로 추론) |
| Voting Power fingerprint | 동일 weight 또는 구간 정규화 | O (고유 power 값으로 식별) |
| 서버 로그 | voter 정보 즉시 폐기, 로그 금지 | O (voter-commitment 매핑) |
| Sender 노출 | Sponsored transaction 필수 | O (on-chain sender = voter) |
| Merkle tree 변조 | On-chain commitment Table + root | 직접적 익명성 위협은 아님 |
| Voting power 조작 | Power가 commitment에 포함, proof에서 검증 | 직접적 익명성 위협은 아님 |
| 이중투표 | On-chain nullifier Table | 직접적 익명성 위협은 아님 |
| Secret 분실 | 브라우저 저장 | 투표 불가 (trade-off) |

**결론**: 타이밍 어택 방지(2-Phase 분리)만으로는 충분하지 않음.
Voting Power fingerprint 대응 + 서버 로그 폐기 + Sponsored tx가 모두 함께 적용되어야 완전한 익명성 보장.

---

## 7. Trusted Setup

Groth16은 circuit별 trusted setup이 필요하다.

### Phase 1: Powers of Tau

범용적인 파라미터. Hermez 또는 Tornado Cash의 공개 Powers of Tau ceremony 결과를 재사용 가능.
circuit 변경 시에도 Phase 1은 재사용 가능.

### Phase 2: Circuit-specific

circuit에 종속적인 파라미터. `anonymous_vote.circom` 전용.
`snarkjs groth16 setup` + `snarkjs zkey contribute` 사용.

- **프로토타입**: 1인 ceremony 허용 (개발자가 직접 수행)
- **프로덕션**: multi-party ceremony 필요 (참여자가 1명이라도 정직하면 안전)

---

## 8. 구현 순서 (Phase 1 프로토타입)

### Step 1: Circom Circuit
1. `circuits/anonymous_vote.circom` 작성
2. Poseidon + Merkle tree inclusion proof
3. 컴파일: `circom --r1cs --wasm --sym`
4. Trusted setup: Powers of Tau Phase 1 다운로드 + Phase 2 수행
5. 산출물: `anonymous_vote.wasm`, `anonymous_vote.zkey`, `verification_key.json`

### Step 2: Move 컨트랙트
1. `anonymous_proposal.move` 작성
2. `sui::groth16::verify_groth16_proof` + `sui::poseidon::poseidon_bn254` 사용
3. Devnet 배포 + 단위 테스트 (hardcoded proof)

### Step 3: 백엔드 API
1. Merkle tree 관리 로직 (`circomlibjs` Poseidon)
2. 엔드포인트: `/anonymous/register-commitment`, `/anonymous/merkle-proof`, `/anonymous/sponsor-vote`
3. DynamoDB 스키마 추가

### Step 4: 프론트엔드
1. Secret/salt 생성 + 암호화 저장 (IndexedDB)
2. Commitment 계산 (`circomlibjs` Poseidon)
3. snarkjs WASM prover 통합
4. 등록/투표 UI

### Step 5: E2E 테스트
1. Circuit 단위 테스트 (`snarkjs groth16 verify`)
2. Hardcoded proof로 Move 컨트랙트 테스트
3. 전체 플로우: 등록 -> 투표 -> 결과 확인

---

## 9. Scope 제한 (Phase 1)

- **포함**: Yes/No 익명 투표, 2-Phase 플로우, Sponsored tx
- **미포함**: MultiChoice 익명 투표 (Phase 2), Delegation, VoteProofNFT (receiver 주소 노출)
- **추가 비용**: 거의 $0 (기존 DynamoDB/Lambda/S3 활용)

---

## 10. 미결정 사항

- [ ] Voting Power fingerprint 대응 방식 (동일 weight / 구간 정규화 / 현행 유지)
- [ ] Registration Phase 기간 (최소 몇 일?)
- [ ] 최소 참여자 수 기준 (너무 적으면 타이밍 어택 위험)
- [ ] Trusted setup ceremony 방식 (프로토타입: 1인, 프로덕션: multi-party)
- [ ] 구현 시작 시점
