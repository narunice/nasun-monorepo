# Governance VotingPowerCertificate + Sponsored Transaction 구현 계획

> **작성일**: 2026-01-05
> **상태**: 계획 완료, 구현 대기

## 1. 개요

### 1.1 해결할 문제

**문제 1: Voting Power 조작 취약점**
- 현재 `proposal::vote(proposal, vote_yes, voting_power, clock)` 함수에서 `voting_power`가 외부 파라미터로 전달됨
- CLI로 `voting_power=1000000` 지정하면 무제한 투표권 조작 가능
- 검증은 `assert!(voting_power > 0)` 만 수행

**문제 2: 투표 가스비 부담**
- 사용자가 직접 가스비 지불 필요
- 투표 참여 심리적 장벽 발생

### 1.2 해결 방안

1. **VotingPowerCertificate Object 기반 설계**
   - Oracle 서명 검증 후 Certificate Object 생성
   - 투표 시 Certificate 소각 (1회성 보장)

2. **Sponsored Transaction**
   - 사용자: 투표 의사만 서명 (가스 X)
   - Admin/Protocol: 가스 지불

### 1.3 결정사항

- ✅ 기존 vote() 함수 **완전 교체** (Certificate 기반만 사용)
- ✅ Keypair 저장: **AWS Secrets Manager**
- ✅ Sponsored Tx: **모든 투표에 적용**

---

## 2. 현재 상태 분석

### 2.1 스마트 컨트랙트 배포 정보

| 항목 | 값 |
|------|-----|
| Package ID | `0xcd753b00e5c298c8b8d37e74ac36732de04f1f2f3a3409d1e67d10ed3126ba1c` |
| AdminCap | `0x21a92db9776a4c4b4c81323103dd16c082ae13c8c86a780e6711fb9b81620972` |
| Dashboard | `0x422ee880...` |
| DelegationRegistry | `0x23f4c7b5...` |

### 2.2 현재 취약한 vote() 함수

```move
public fun vote(
    self: &mut Proposal,
    vote_yes: bool,
    voting_power: u64,  // <-- 취약점: 외부에서 조작 가능
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(voting_power > 0, EInvalidVotingPower);  // 검증 부족
    // ...
}
```

---

## 3. Phase 1: Move 스마트 컨트랙트

### 3.1 신규 파일: `voting_power.move`

**경로**: `apps/nasun-website/contracts/governance/sources/voting_power.move`

```move
module governance::voting_power;

use sui::ed25519;
use sui::clock::{Clock};
use sui::event;
use sui::bcs;
use governance::dashboard::AdminCap;

// === Errors ===
const EInvalidSignature: u64 = 0;
const ECertificateExpired: u64 = 1;
const EProposalMismatch: u64 = 2;
const EVoterMismatch: u64 = 3;
const EOraclePaused: u64 = 4;
const EInvalidOracle: u64 = 5;

// === Structs ===

/// Oracle configuration - stores Ed25519 public keys
public struct VotingPowerOracle has key, store {
    id: UID,
    public_key: vector<u8>,           // 32 bytes Ed25519 public key
    previous_public_key: Option<vector<u8>>,
    rotation_timestamp: u64,
    rotation_grace_period: u64,       // Grace period in ms (e.g., 1 hour)
    is_paused: bool,
}

/// Voting Power Certificate - one-time use, burned on vote
public struct VotingPowerCertificate has key {
    id: UID,
    voter: address,
    proposal_id: ID,
    voting_power: u64,
    expires_at: u64,
}

// === Events ===

public struct CertificateMinted has copy, drop {
    certificate_id: ID,
    voter: address,
    proposal_id: ID,
    voting_power: u64,
    expires_at: u64,
}

public struct OracleKeyRotated has copy, drop {
    oracle_id: ID,
    new_public_key: vector<u8>,
    rotated_at: u64,
}

// === Admin Functions ===

/// Create a new VotingPowerOracle (AdminCap required)
public fun create_oracle(
    _admin_cap: &AdminCap,
    public_key: vector<u8>,
    grace_period: u64,
    ctx: &mut TxContext
): VotingPowerOracle {
    assert!(public_key.length() == 32, EInvalidOracle);

    VotingPowerOracle {
        id: object::new(ctx),
        public_key,
        previous_public_key: option::none(),
        rotation_timestamp: 0,
        rotation_grace_period: grace_period,
        is_paused: false,
    }
}

/// Rotate Oracle key with grace period for existing signatures
public fun rotate_oracle_key(
    oracle: &mut VotingPowerOracle,
    _admin_cap: &AdminCap,
    new_public_key: vector<u8>,
    clock: &Clock,
) {
    assert!(new_public_key.length() == 32, EInvalidOracle);
    oracle.previous_public_key = option::some(oracle.public_key);
    oracle.public_key = new_public_key;
    oracle.rotation_timestamp = clock.timestamp_ms();

    event::emit(OracleKeyRotated {
        oracle_id: object::id(oracle),
        new_public_key,
        rotated_at: clock.timestamp_ms(),
    });
}

/// Pause/unpause certificate issuance
public fun set_oracle_paused(
    oracle: &mut VotingPowerOracle,
    _admin_cap: &AdminCap,
    paused: bool,
) {
    oracle.is_paused = paused;
}

// === Public Functions ===

/// Mint a VotingPowerCertificate with Oracle signature verification
/// Message format: voter || proposal_id || voting_power (8 bytes BE) || expires_at (8 bytes BE)
public fun mint_certificate(
    oracle: &VotingPowerOracle,
    voter: address,
    proposal_id: ID,
    voting_power: u64,
    expires_at: u64,
    signature: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext
): VotingPowerCertificate {
    assert!(!oracle.is_paused, EOraclePaused);
    assert!(expires_at > clock.timestamp_ms(), ECertificateExpired);

    let msg = build_certificate_message(voter, proposal_id, voting_power, expires_at);

    // Verify with current key
    let mut valid = ed25519::ed25519_verify(&signature, &oracle.public_key, &msg);

    // Try previous key within grace period
    if (!valid && oracle.previous_public_key.is_some()) {
        let grace_end = oracle.rotation_timestamp + oracle.rotation_grace_period;
        if (clock.timestamp_ms() < grace_end) {
            let prev_key = oracle.previous_public_key.borrow();
            valid = ed25519::ed25519_verify(&signature, prev_key, &msg);
        };
    };

    assert!(valid, EInvalidSignature);

    let certificate = VotingPowerCertificate {
        id: object::new(ctx),
        voter,
        proposal_id,
        voting_power,
        expires_at,
    };

    event::emit(CertificateMinted {
        certificate_id: object::id(&certificate),
        voter, proposal_id, voting_power, expires_at,
    });

    certificate
}

/// Build message for signature verification
fun build_certificate_message(
    voter: address,
    proposal_id: ID,
    voting_power: u64,
    expires_at: u64
): vector<u8> {
    let mut msg = vector::empty<u8>();
    vector::append(&mut msg, bcs::to_bytes(&voter));
    vector::append(&mut msg, bcs::to_bytes(&proposal_id));
    vector::append(&mut msg, u64_to_be_bytes(voting_power));
    vector::append(&mut msg, u64_to_be_bytes(expires_at));
    msg
}

/// Convert u64 to big-endian bytes
fun u64_to_be_bytes(value: u64): vector<u8> {
    let mut bytes = vector::empty<u8>();
    let mut i = 0;
    while (i < 8) {
        let shift = (7 - i) * 8;
        bytes.push_back(((value >> shift) & 0xFF) as u8);
        i = i + 1;
    };
    bytes
}

/// Consume certificate and return voting power (called by proposal::vote)
public(package) fun consume_certificate(
    certificate: VotingPowerCertificate,
    proposal_id: ID,
    clock: &Clock,
    ctx: &TxContext
): u64 {
    assert!(certificate.voter == ctx.sender(), EVoterMismatch);
    assert!(certificate.proposal_id == proposal_id, EProposalMismatch);
    assert!(certificate.expires_at > clock.timestamp_ms(), ECertificateExpired);

    let voting_power = certificate.voting_power;

    // Burn certificate (prevents reuse)
    let VotingPowerCertificate { id, voter: _, proposal_id: _, voting_power: _, expires_at: _ } = certificate;
    object::delete(id);

    voting_power
}

// === View Functions ===

public fun oracle_public_key(oracle: &VotingPowerOracle): vector<u8> {
    oracle.public_key
}

public fun oracle_is_paused(oracle: &VotingPowerOracle): bool {
    oracle.is_paused
}
```

### 3.2 수정 파일: `proposal.move`

**경로**: `apps/nasun-website/contracts/governance/sources/proposal.move`

**변경사항**:

```move
// 상단에 import 추가
use governance::voting_power::{Self, VotingPowerCertificate};

// 기존 vote() 함수 삭제하고 새 함수로 교체
/// Vote on a proposal with VotingPowerCertificate (secure)
public fun vote(
    self: &mut Proposal,
    vote_yes: bool,
    certificate: VotingPowerCertificate,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(self.expiration > clock.timestamp_ms(), EProposalExpired);
    assert!(self.is_active(), EProposalDelisted);
    assert!(!self.voters.contains(ctx.sender()), EDuplicateVote);

    // Consume certificate and get voting power (certificate is burned)
    let proposal_id = self.id.to_inner();
    let voting_power = voting_power::consume_certificate(certificate, proposal_id, clock, ctx);

    assert!(voting_power > 0, EInvalidVotingPower);

    if (vote_yes) {
        self.total_power_yes = self.total_power_yes + voting_power;
        self.vote_count_yes = self.vote_count_yes + 1;
    } else {
        self.total_power_no = self.total_power_no + voting_power;
        self.vote_count_no = self.vote_count_no + 1;
    };

    self.voters.add(ctx.sender(), VoteRecord { vote_yes, voting_power });
    issue_vote_proof(self, vote_yes, ctx);

    event::emit(VoteRegistered {
        proposal_id: self.id.to_inner(),
        voter: ctx.sender(),
        vote_yes,
        voting_power
    });
}
```

### 3.3 배포 명령어

```bash
# 1. 빌드
cd apps/nasun-website/contracts/governance
/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build

# 2. 업그레이드 (기존 패키지)
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client upgrade \
  --upgrade-capability <UPGRADE_CAP_ID> \
  --gas-budget 100000000

# 3. VotingPowerOracle 생성
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client call \
  --function create_oracle \
  --module voting_power \
  --package <NEW_PACKAGE_ID> \
  --args <ADMIN_CAP_ID> <PUBLIC_KEY_HEX> 3600000 \  # 1시간 grace period
  --gas-budget 10000000

# 4. Oracle을 Shared Object로 공유
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client call \
  --function share_oracle \
  --module voting_power \
  --package <NEW_PACKAGE_ID> \
  --args <ORACLE_ID> \
  --gas-budget 10000000
```

---

## 4. Phase 2: 백엔드 API

### 4.1 신규 엔드포인트: `POST /certificate`

**경로**: `apps/nasun-website/cdk/lambda-src/governance-api/src/index.ts`

```typescript
import * as ed25519 from '@noble/ed25519';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

// Cache for Oracle keypair
let oraclePrivateKey: Uint8Array | null = null;

async function getOraclePrivateKey(): Promise<Uint8Array> {
  if (oraclePrivateKey) return oraclePrivateKey;

  const secret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: "nasun-governance-oracle" })
  );
  const { privateKey } = JSON.parse(secret.SecretString!);
  oraclePrivateKey = Buffer.from(privateKey, 'hex');
  return oraclePrivateKey;
}

// POST /certificate
if (path.endsWith("/certificate") && event.httpMethod === "POST") {
  const { voter, proposalId, twitterId, ethSignature } = JSON.parse(event.body || "{}");

  if (!voter || !proposalId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing voter or proposalId" }) };
  }

  // 1. Calculate voting power (reuse existing logic)
  let leaderboardScore = 0;
  if (twitterId) {
    leaderboardScore = await getLeaderboardScore(twitterId);
  }

  let hasNft = false;
  if (ethSignature) {
    const ethAddress = recoverAddressFromSignature(ethSignature.message, ethSignature.signature);
    hasNft = await verifyNftOwnership(ethAddress);
  }

  const power = calculateVotingPower(leaderboardScore, hasNft, 0);
  const votingPower = Math.max(1, power.total); // Minimum 1

  // 2. Build message (voter || proposalId || votingPower || expiresAt)
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes TTL

  const voterBytes = Buffer.from(voter.replace('0x', ''), 'hex');
  const proposalIdBytes = Buffer.from(proposalId.replace('0x', ''), 'hex');
  const votingPowerBytes = Buffer.alloc(8);
  votingPowerBytes.writeBigUInt64BE(BigInt(votingPower));
  const expiresAtBytes = Buffer.alloc(8);
  expiresAtBytes.writeBigUInt64BE(BigInt(expiresAt));

  const message = Buffer.concat([voterBytes, proposalIdBytes, votingPowerBytes, expiresAtBytes]);

  // 3. Sign with Oracle private key
  const privateKey = await getOraclePrivateKey();
  const signature = await ed25519.signAsync(message, privateKey);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      voter,
      proposalId,
      votingPower,
      expiresAt,
      signature: Buffer.from(signature).toString('hex'),
      breakdown: power,
    }),
  };
}
```

### 4.2 신규 엔드포인트: `POST /sponsor`

```typescript
import { SuiClient, Ed25519Keypair } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";

let sponsorKeypair: Ed25519Keypair | null = null;

async function getSponsorKeypair(): Promise<Ed25519Keypair> {
  if (sponsorKeypair) return sponsorKeypair;

  const secret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: "nasun-governance-sponsor" })
  );
  const { privateKey } = JSON.parse(secret.SecretString!);
  sponsorKeypair = Ed25519Keypair.fromSecretKey(privateKey);
  return sponsorKeypair;
}

// POST /sponsor
if (path.endsWith("/sponsor") && event.httpMethod === "POST") {
  const { txKindBytes, sender } = JSON.parse(event.body || "{}");

  if (!txKindBytes || !sender) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing txKindBytes or sender" }) };
  }

  const suiClient = new SuiClient({ url: process.env.SUI_RPC_URL || "https://rpc.devnet.nasun.io" });
  const keypair = await getSponsorKeypair();
  const sponsorAddress = keypair.getPublicKey().toSuiAddress();

  // 1. Get sponsor's gas coins
  const coins = await suiClient.getCoins({ owner: sponsorAddress, coinType: "0x2::sui::SUI" });
  if (coins.data.length === 0) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Sponsor has no gas coins" }) };
  }

  // 2. Reconstruct transaction
  const tx = Transaction.fromKind(fromBase64(txKindBytes));
  tx.setSender(sender);
  tx.setGasOwner(sponsorAddress);
  tx.setGasPayment([{
    objectId: coins.data[0].coinObjectId,
    version: coins.data[0].version,
    digest: coins.data[0].digest,
  }]);
  tx.setGasBudget(10000000); // 0.01 SUI

  // 3. Build and sign
  const txBytes = await tx.build({ client: suiClient });
  const { signature } = await keypair.signTransaction(txBytes);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      txBytes: toBase64(txBytes),
      sponsorSignature: signature,
      digest: tx.getDigest(),
    }),
  };
}
```

### 4.3 CDK 스택 수정

**경로**: `apps/nasun-website/cdk/lib/common-stack.ts`

```typescript
// Lambda IAM Policy에 Secrets Manager 권한 추가
governanceApiLambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['secretsmanager:GetSecretValue'],
  resources: [
    `arn:aws:secretsmanager:${this.region}:${this.account}:secret:nasun-governance-oracle-*`,
    `arn:aws:secretsmanager:${this.region}:${this.account}:secret:nasun-governance-sponsor-*`,
  ],
}));

// 환경 변수 추가
governanceApiLambda.addEnvironment('VOTING_POWER_ORACLE_ID', '0x...');
governanceApiLambda.addEnvironment('SUI_RPC_URL', 'https://rpc.devnet.nasun.io');
```

### 4.4 AWS Secrets Manager 설정

```bash
# Oracle keypair 생성 및 저장
aws secretsmanager create-secret \
  --name nasun-governance-oracle \
  --secret-string '{"privateKey": "<64-byte-hex-private-key>"}'

# Sponsor keypair 저장
aws secretsmanager create-secret \
  --name nasun-governance-sponsor \
  --secret-string '{"privateKey": "suiprivkey1..."}'
```

---

## 5. Phase 3: 프론트엔드

### 5.1 신규 Hook: `useSponsoredVote.ts`

**경로**: `apps/nasun-website/frontend/src/features/governance/hooks/useSponsoredVote.ts`

```typescript
import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { useAuth } from "@/providers/auth/AuthContext";

const API_URL = import.meta.env.VITE_GOVERNANCE_API_URL;
const PACKAGE_ID = import.meta.env.VITE_GOVERNANCE_PACKAGE_ID;
const ORACLE_ID = import.meta.env.VITE_VOTING_POWER_ORACLE_ID;
const CLOCK_ID = "0x6";

interface VoteResult {
  success: boolean;
  digest?: string;
  error?: string;
}

export function useSponsoredVote() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { account, status } = useWallet();
  const { isConnected: isZkConnected, address: zkAddress, zkSignTransaction } = useZkLogin();
  const { user } = useAuth();

  const vote = async (proposalId: string, voteYes: boolean): Promise<VoteResult> => {
    setIsPending(true);
    setError(null);

    try {
      const voterAddress = isZkConnected ? zkAddress : account?.address;
      if (!voterAddress) throw new Error("Wallet not connected");

      // 1. Request Certificate from API
      const certResponse = await fetch(`${API_URL}/certificate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter: voterAddress,
          proposalId,
          twitterId: user?.twitterId,
        }),
      });

      if (!certResponse.ok) {
        const err = await certResponse.json();
        throw new Error(err.error || "Failed to get certificate");
      }

      const cert = await certResponse.json();

      // 2. Build Transaction (mint_certificate + vote)
      const tx = new Transaction();

      // mint_certificate
      const [certificate] = tx.moveCall({
        target: `${PACKAGE_ID}::voting_power::mint_certificate`,
        arguments: [
          tx.object(ORACLE_ID),
          tx.pure.address(voterAddress),
          tx.pure.id(proposalId),
          tx.pure.u64(cert.votingPower),
          tx.pure.u64(cert.expiresAt),
          tx.pure.vector("u8", Buffer.from(cert.signature, "hex")),
          tx.object(CLOCK_ID),
        ],
      });

      // vote
      tx.moveCall({
        target: `${PACKAGE_ID}::proposal::vote`,
        arguments: [
          tx.object(proposalId),
          tx.pure.bool(voteYes),
          certificate,
          tx.object(CLOCK_ID),
        ],
      });

      // 3. Get sponsor signature
      const kindBytes = await tx.build({ onlyTransactionKind: true });

      const sponsorResponse = await fetch(`${API_URL}/sponsor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txKindBytes: toBase64(kindBytes),
          sender: voterAddress,
        }),
      });

      if (!sponsorResponse.ok) {
        const err = await sponsorResponse.json();
        throw new Error(err.error || "Failed to get sponsor signature");
      }

      const { txBytes, sponsorSignature } = await sponsorResponse.json();
      const txBytesArray = fromBase64(txBytes);

      // 4. User signs
      let userSignature: string;
      if (isZkConnected) {
        userSignature = await zkSignTransaction(txBytesArray);
      } else {
        // For local wallet - need to implement signTransaction
        const { signTransaction } = await import("@nasun/wallet");
        userSignature = await signTransaction(txBytesArray);
      }

      // 5. Execute with both signatures
      const suiClient = getSuiClient();
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [userSignature, sponsorSignature],
        options: { showEffects: true },
      });

      return { success: true, digest: result.digest };

    } catch (err: any) {
      const errorMessage = err.message || "Vote failed";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsPending(false);
    }
  };

  return { vote, isPending, error };
}
```

### 5.2 VoteModal 수정

**경로**: `apps/nasun-website/frontend/src/features/governance/components/VoteModal.tsx`

주요 변경:
- `useSponsoredVote` hook 사용
- "Vote (Gas Free)" 버튼으로 변경
- Certificate 발급 로딩 상태 추가

```typescript
import { useSponsoredVote } from "../hooks/useSponsoredVote";

// 기존 handleVote 함수 교체
const { vote: sponsoredVote, isPending: isVoting, error: voteError } = useSponsoredVote();

const handleVote = async () => {
  if (!proposal) return;

  const result = await sponsoredVote(proposal.id.id, selectedVote === "yes");

  if (result.success) {
    // 성공 처리
    onVoteSuccess?.();
    onClose();
  } else {
    // 에러 표시
    setError(result.error);
  }
};

// 버튼 텍스트 변경
<button onClick={handleVote} disabled={isVoting}>
  {isVoting ? "Voting..." : "Vote (Gas Free)"}
</button>
```

### 5.3 환경 변수

**경로**: `apps/nasun-website/frontend/.env.staging`, `.env.production`

```bash
VITE_VOTING_POWER_ORACLE_ID=0x...
VITE_GOVERNANCE_PACKAGE_ID=0x...  # 업그레이드 후 새 ID
```

---

## 6. 수정 파일 요약

| 파일 | 작업 | 우선순위 |
|------|------|---------|
| `contracts/governance/sources/voting_power.move` | **신규** | P0 |
| `contracts/governance/sources/proposal.move` | **수정** (vote 함수 교체) | P0 |
| `cdk/lambda-src/governance-api/src/index.ts` | **확장** (/certificate, /sponsor) | P0 |
| `cdk/lib/common-stack.ts` | **수정** (IAM, 환경변수) | P0 |
| `frontend/src/features/governance/hooks/useSponsoredVote.ts` | **신규** | P1 |
| `frontend/src/features/governance/components/VoteModal.tsx` | **수정** | P1 |
| `frontend/.env.staging`, `.env.production` | **수정** | P1 |

---

## 7. 배포 순서

### Day 1: 인프라 준비
1. AWS Secrets Manager에 Oracle/Sponsor keypair 생성
2. Sponsor wallet에 NASUN 충전 (가스비용)
3. CDK 스택 업데이트 (IAM 권한)

### Day 2: 스마트 컨트랙트
1. voting_power.move 추가
2. proposal.move 수정
3. 패키지 업그레이드 배포
4. VotingPowerOracle 생성 및 공유

### Day 3: 백엔드
1. governance-api 엔드포인트 추가 (/certificate, /sponsor)
2. CDK 배포
3. API 테스트

### Day 4: 프론트엔드
1. useSponsoredVote hook 추가
2. VoteModal 수정
3. 환경 변수 설정
4. E2E 테스트

### Day 5: 검증
1. Devnet 테스트 (Certificate 발급 → Sponsored 투표)
2. CLI 공격 시도 테스트 (실패 확인)
3. 롤백 계획 확인

---

## 8. 보안 체크리스트

- [ ] Certificate 서명 검증 (Ed25519) 동작 확인
- [ ] Certificate 만료 시간 (5분) 검증
- [ ] Certificate 소각 후 재사용 불가 확인
- [ ] voter/proposal_id 불일치 시 거부 확인
- [ ] Oracle pause 시 Certificate 발급 차단
- [ ] Sponsor wallet 잔액 모니터링 설정
- [ ] CLI로 voting_power 조작 시도 → 실패 확인

---

## 9. 롤백 계획

스마트 컨트랙트 업그레이드 후 문제 발생 시:
1. 프론트엔드에서 이전 버전으로 환경 변수 변경 (불가 - 함수 시그니처 변경됨)
2. 새 프로포절 생성 중단 (Oracle pause)
3. 기존 프로포절은 만료까지 대기
4. 심각한 문제 시: 새 패키지 배포 후 데이터 마이그레이션

---

## 10. 참고 자료

- [Sui Ed25519 Module](https://docs.sui.io/references/framework/sui_sui/ed25519)
- [Sui Sponsored Transactions](https://docs.sui.io/guides/developer/sui-101/sponsor-txn)
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/typescript)
- [@noble/ed25519](https://github.com/paulmillr/noble-ed25519)
