# Governance VotingPowerCertificate + Sponsored Transaction 구현 계획

> **작성일**: 2026-01-05
> **상태**: 계획 완료, 구현 대기
> **리뷰**: ChatGPT/Perplexity 피드백 반영 (v3 - P0 보안 강화)

---

## 0. 피드백 반영 요약

| 피드백 | 반영 |
|--------|------|
| Certificate 중복 발급 방지 | ✅ `cert_issued` Table 추가 |
| TTL 정책 완화 (5분→15분) | ✅ Devnet 15분, Mainnet 30분 |
| Oracle ≠ 정책 결정자 분리 | ✅ VotingPowerPolicy 구조 추가 (Phase 2) |
| Redis TTL 동기화 | ✅ redisKey 반환 추가 |
| MultisigCap 확장 경로 | ✅ Phase 2 로드맵 추가 |
| **Sponsor Tx 검증** | ✅ txKind 파싱 + target 화이트리스트 (v3) |
| **Oracle 중앙화 명시** | ✅ UI/문서에 명시 (v3) |
| **Certificate issuer 필드** | ✅ multi-oracle 확장성 (v3) |

---

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
use sui::table::{Self, Table};
use governance::dashboard::AdminCap;

// === Errors ===
const EInvalidSignature: u64 = 0;
const ECertificateExpired: u64 = 1;
const EProposalMismatch: u64 = 2;
const EVoterMismatch: u64 = 3;
const EOraclePaused: u64 = 4;
const EInvalidOracle: u64 = 5;
const ECertificateAlreadyIssued: u64 = 6;  // NEW: 중복 발급 방지

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

/// Certificate Registry - tracks issued certificates (NEW: 중복 방지)
public struct CertificateRegistry has key {
    id: UID,
    /// (proposal_id, voter) -> bool (issued or not)
    issued: Table<address, Table<ID, bool>>,
}

/// Voting Power Certificate - one-time use, burned on vote
public struct VotingPowerCertificate has key {
    id: UID,
    voter: address,
    proposal_id: ID,
    voting_power: u64,
    expires_at: u64,
    issuer: ID,  // NEW (v3): Oracle ID for multi-oracle support
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

/// Create CertificateRegistry (AdminCap required) - NEW
public fun create_registry(
    _admin_cap: &AdminCap,
    ctx: &mut TxContext
): CertificateRegistry {
    CertificateRegistry {
        id: object::new(ctx),
        issued: table::new(ctx),
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
    registry: &mut CertificateRegistry,  // NEW: Registry 추가
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

    // NEW: 중복 발급 방지 체크
    if (registry.issued.contains(&voter)) {
        let voter_certs = registry.issued.borrow(&voter);
        assert!(!voter_certs.contains(&proposal_id), ECertificateAlreadyIssued);
    };

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

    // NEW: Registry에 발급 기록
    if (!registry.issued.contains(&voter)) {
        registry.issued.add(voter, table::new(ctx));
    };
    let voter_certs = registry.issued.borrow_mut(&voter);
    voter_certs.add(proposal_id, true);

    let certificate = VotingPowerCertificate {
        id: object::new(ctx),
        voter,
        proposal_id,
        voting_power,
        expires_at,
        issuer: object::id(oracle),  // NEW (v3): Track which Oracle issued this
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

/// Check if certificate was already issued for voter + proposal
public fun is_certificate_issued(
    registry: &CertificateRegistry,
    voter: address,
    proposal_id: ID
): bool {
    if (!registry.issued.contains(&voter)) {
        return false
    };
    let voter_certs = registry.issued.borrow(&voter);
    voter_certs.contains(&proposal_id)
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

# 4. CertificateRegistry 생성 (NEW)
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client call \
  --function create_registry \
  --module voting_power \
  --package <NEW_PACKAGE_ID> \
  --args <ADMIN_CAP_ID> \
  --gas-budget 10000000

# 5. Oracle, Registry를 Shared Object로 공유
```

---

## 4. Phase 1: 백엔드 API

### 4.1 신규 엔드포인트: `POST /certificate`

**경로**: `apps/nasun-website/cdk/lambda-src/governance-api/src/index.ts`

```typescript
import * as ed25519 from '@noble/ed25519';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import Redis from 'ioredis';  // NEW: Redis 추가

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
const redis = new Redis(process.env.REDIS_URL);  // NEW

// TTL 설정 (피드백 반영: 5분 → 15분)
const CERTIFICATE_TTL_MS = 15 * 60 * 1000;  // 15분 (Devnet)
// const CERTIFICATE_TTL_MS = 30 * 60 * 1000;  // 30분 (Mainnet)

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

  // NEW: Redis 중복 체크 (온체인 Registry와 동기화)
  const redisKey = `cert:${proposalId}:${voter}`;
  const existing = await redis.get(redisKey);
  if (existing) {
    return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({
      error: "Certificate already issued for this proposal",
      existingCert: JSON.parse(existing)
    }) };
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
  const expiresAt = Date.now() + CERTIFICATE_TTL_MS;

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

  const cert = {
    voter,
    proposalId,
    votingPower,
    expiresAt,
    signature: Buffer.from(signature).toString('hex'),
    breakdown: power,
    redisKey,  // NEW: Frontend에서 사용 가능
  };

  // NEW: Redis에 저장 (TTL 동기화)
  await redis.set(redisKey, JSON.stringify(cert), 'EX', Math.floor(CERTIFICATE_TTL_MS / 1000));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(cert),
  };
}
```

### 4.2 신규 엔드포인트: `POST /sponsor` (P0 보안 강화)

> ⚠️ **중요**: Sponsor는 블라인드 서명기가 아닌 **Gatekeeper** 역할을 해야 합니다.
> txKind를 파싱하여 허용된 트랜잭션만 서명합니다.

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

// ===== NEW (v3): Transaction Validation - 블라인드 서명 방지 =====
const GOVERNANCE_PACKAGE_ID = process.env.GOVERNANCE_PACKAGE_ID!;

// 허용된 MoveCall targets (화이트리스트)
const ALLOWED_TARGETS = new Set([
  `${GOVERNANCE_PACKAGE_ID}::voting_power::mint_certificate`,
  `${GOVERNANCE_PACKAGE_ID}::proposal::vote`,
]);

/**
 * Validate transaction kind to prevent abuse
 *
 * Rules:
 * 1. Must contain exactly 2 MoveCall commands
 * 2. Order: mint_certificate → vote
 * 3. All targets must be in whitelist
 */
function validateTxKind(tx: Transaction): { valid: boolean; error?: string } {
  const txData = tx.getData();
  const commands = txData.commands;

  // 1. Must have exactly 2 commands
  if (commands.length !== 2) {
    return { valid: false, error: `Expected 2 commands, got ${commands.length}` };
  }

  const expectedFunctions = ['mint_certificate', 'vote'];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];

    // 2. All commands must be MoveCall
    if (cmd.$kind !== 'MoveCall') {
      return { valid: false, error: `Command ${i} is not MoveCall: ${cmd.$kind}` };
    }

    const moveCall = cmd.MoveCall;
    const target = `${moveCall.package}::${moveCall.module}::${moveCall.function}`;

    // 3. Check whitelist
    if (!ALLOWED_TARGETS.has(target)) {
      return { valid: false, error: `Unauthorized target: ${target}` };
    }

    // 4. Check order
    if (moveCall.function !== expectedFunctions[i]) {
      return { valid: false, error: `Wrong order at ${i}: expected ${expectedFunctions[i]}, got ${moveCall.function}` };
    }
  }

  return { valid: true };
}

// POST /sponsor
if (path.endsWith("/sponsor") && event.httpMethod === "POST") {
  const { txKindBytes, sender } = JSON.parse(event.body || "{}");

  if (!txKindBytes || !sender) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing txKindBytes or sender" }) };
  }

  // ===== NEW (v3): Validate transaction before signing =====
  const tx = Transaction.fromKind(fromBase64(txKindBytes));
  const validation = validateTxKind(tx);

  if (!validation.valid) {
    console.error("Transaction validation failed:", validation.error);
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Transaction validation failed",
        details: validation.error,
      }),
    };
  }

  const suiClient = new SuiClient({ url: process.env.SUI_RPC_URL || "https://rpc.devnet.nasun.io" });
  const keypair = await getSponsorKeypair();
  const sponsorAddress = keypair.getPublicKey().toSuiAddress();

  // 1. Get sponsor's gas coins
  const coins = await suiClient.getCoins({ owner: sponsorAddress, coinType: "0x2::sui::SUI" });
  if (coins.data.length === 0) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Sponsor has no gas coins" }) };
  }

  // 2. Set transaction parameters
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
governanceApiLambda.addEnvironment('CERTIFICATE_REGISTRY_ID', '0x...');  // NEW
governanceApiLambda.addEnvironment('SUI_RPC_URL', 'https://rpc.devnet.nasun.io');
governanceApiLambda.addEnvironment('REDIS_URL', 'redis://...');  // NEW
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

## 5. Phase 1: 프론트엔드

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
const REGISTRY_ID = import.meta.env.VITE_CERTIFICATE_REGISTRY_ID;  // NEW
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
        if (certResponse.status === 409) {
          throw new Error("You have already received a certificate for this proposal");
        }
        throw new Error(err.error || "Failed to get certificate");
      }

      const cert = await certResponse.json();

      // 2. Build Transaction (mint_certificate + vote)
      const tx = new Transaction();

      // mint_certificate (with Registry - NEW)
      const [certificate] = tx.moveCall({
        target: `${PACKAGE_ID}::voting_power::mint_certificate`,
        arguments: [
          tx.object(ORACLE_ID),
          tx.object(REGISTRY_ID),  // NEW
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

### 5.3 환경 변수

**경로**: `apps/nasun-website/frontend/.env.staging`, `.env.production`

```bash
VITE_VOTING_POWER_ORACLE_ID=0x...
VITE_CERTIFICATE_REGISTRY_ID=0x...  # NEW
VITE_GOVERNANCE_PACKAGE_ID=0x...  # 업그레이드 후 새 ID
```

---

## 6. Oracle 중앙화 명시 (v3 추가)

> ⚠️ **중요**: 이 설계는 기술적으로 안전하지만, Oracle은 중앙화된 컴포넌트입니다.
> 사용자에게 이 사실을 명확히 알려야 합니다.

### 6.1 UI 명시 (VotingPowerSummary.tsx)

```tsx
// "How Voting Power Works" 섹션에 추가
<li>
  <span className="text-yellow-400 font-medium">⚠️ Current Phase</span>
  <p className="mt-0.5 text-xs text-nasun-white/60">
    This governance phase uses an off-chain oracle for voting power calculation.
    We plan to transition to a fully decentralized system in Phase 2.
  </p>
</li>
```

### 6.2 문서 명시 (Governance Page)

```markdown
## Trust Assumptions

**Current Phase (Phase 1)**:
- Voting power is calculated off-chain by the Nasun team
- Sources: X engagement leaderboard + Battalion NFT ownership
- The calculation is signed by a trusted Oracle

**Future Phase (Phase 2)**:
- Multi-signature Oracle (3/5 threshold)
- On-chain VotingPowerPolicy for DAO-controlled weights
- ZK proofs for leaderboard verification (Nautilus integration)
```

### 6.3 투명성 대시보드 (선택)

향후 추가 고려:
- Oracle 서명 검증 로그 공개
- Certificate 발급 통계
- Sponsor 가스 사용량

---

## 7. Phase 2: 장기 확장 로드맵 (피드백 반영)

### 7.1 MultisigCap Oracle (Mainnet 전 필수)

```move
/// Multi-signature Oracle for decentralized governance
public struct MultisigOracle has key {
    id: UID,
    signers: vector<address>,     // 허용된 서명자 목록
    threshold: u64,               // 필요한 서명 수 (예: 3/5)
    public_keys: vector<vector<u8>>,
}

/// Verify multiple signatures meet threshold
public fun verify_multisig(
    oracle: &MultisigOracle,
    signatures: vector<vector<u8>>,
    message: vector<u8>
): bool {
    let valid_count = 0;
    let i = 0;
    while (i < oracle.public_keys.length()) {
        let j = 0;
        while (j < signatures.length()) {
            if (ed25519::ed25519_verify(&signatures[j], &oracle.public_keys[i], &message)) {
                valid_count = valid_count + 1;
                break
            };
            j = j + 1;
        };
        i = i + 1;
    };
    valid_count >= oracle.threshold
}
```

### 6.2 VotingPowerPolicy Object (Oracle ≠ 정책 결정자)

```move
/// On-chain voting power policy (DAO-controlled)
public struct VotingPowerPolicy has key {
    id: UID,
    leaderboard_weight: u64,      // 기본값: 1
    nft_bonus: u64,               // 기본값: 2
    token_weight: u64,            // TGE 후 활성화
    max_voting_power: u64,        // 상한선 (DoS 방지)
    min_voting_power: u64,        // 하한선 (기본: 1)
}

/// Update policy (AdminCap or DAO vote required)
public fun update_policy(
    policy: &mut VotingPowerPolicy,
    _admin_cap: &AdminCap,
    new_leaderboard_weight: u64,
    new_nft_bonus: u64,
    new_token_weight: u64,
) {
    policy.leaderboard_weight = new_leaderboard_weight;
    policy.nft_bonus = new_nft_bonus;
    policy.token_weight = new_token_weight;
}
```

### 6.3 ZK Leaderboard (Future - Nautilus Oracle)

- Nautilus tamper-proof oracle 통합
- ZK proof로 Leaderboard score 검증
- 완전 탈중앙화 voting power

---

## 7. 수정 파일 요약

| 파일 | 작업 | 우선순위 |
|------|------|---------|
| `contracts/governance/sources/voting_power.move` | **신규** | P0 |
| `contracts/governance/sources/proposal.move` | **수정** (vote 함수 교체) | P0 |
| `cdk/lambda-src/governance-api/src/index.ts` | **확장** (/certificate, /sponsor) | P0 |
| `cdk/lib/common-stack.ts` | **수정** (IAM, 환경변수, Redis) | P0 |
| `frontend/src/features/governance/hooks/useSponsoredVote.ts` | **신규** | P1 |
| `frontend/src/features/governance/components/VoteModal.tsx` | **수정** | P1 |
| `frontend/.env.staging`, `.env.production` | **수정** | P1 |

---

## 8. 배포 순서

### Day 1: 인프라 준비
1. AWS Secrets Manager에 Oracle/Sponsor keypair 생성
2. Sponsor wallet에 NASUN 충전 (가스비용)
3. Redis 설정 (ElastiCache 또는 Upstash)
4. CDK 스택 업데이트 (IAM 권한)

### Day 2: 스마트 컨트랙트
1. voting_power.move 추가
2. proposal.move 수정
3. 패키지 업그레이드 배포
4. VotingPowerOracle 생성 및 공유
5. CertificateRegistry 생성 및 공유

### Day 3: 백엔드
1. governance-api 엔드포인트 추가 (/certificate, /sponsor)
2. Redis 통합
3. CDK 배포
4. API 테스트

### Day 4: 프론트엔드
1. useSponsoredVote hook 추가
2. VoteModal 수정
3. 환경 변수 설정
4. E2E 테스트

### Day 5: 검증
1. Devnet 테스트 (Certificate 발급 → Sponsored 투표)
2. CLI 공격 시도 테스트 (실패 확인)
3. 중복 Certificate 발급 시도 → 실패 확인
4. **Sponsor Tx 악용 테스트** (v3):
   - mint만 포함한 Tx → 거부 확인
   - 잘못된 순서 (vote → mint) → 거부 확인
   - 허용되지 않은 MoveCall 삽입 → 거부 확인
5. 롤백 계획 확인

---

## 9. 보안 체크리스트

- [ ] Certificate 서명 검증 (Ed25519) 동작 확인
- [ ] Certificate 만료 시간 (15분) 검증
- [ ] Certificate 소각 후 재사용 불가 확인
- [ ] **Certificate 중복 발급 방지 확인** (v2)
- [ ] voter/proposal_id 불일치 시 거부 확인
- [ ] Oracle pause 시 Certificate 발급 차단
- [ ] Sponsor wallet 잔액 모니터링 설정
- [ ] CLI로 voting_power 조작 시도 → 실패 확인
- [ ] Redis TTL과 Certificate TTL 동기화 확인
- [ ] **Sponsor Tx 검증: mint+vote 외 MoveCall 거부 확인** (v3)
- [ ] **Sponsor Tx 검증: 잘못된 순서 거부 확인** (v3)
- [ ] **Certificate issuer 필드가 Oracle ID와 일치 확인** (v3)

---

## 10. 롤백 계획

스마트 컨트랙트 업그레이드 후 문제 발생 시:
1. 프론트엔드에서 이전 버전으로 환경 변수 변경 (불가 - 함수 시그니처 변경됨)
2. 새 프로포절 생성 중단 (Oracle pause)
3. 기존 프로포절은 만료까지 대기
4. 심각한 문제 시: 새 패키지 배포 후 데이터 마이그레이션

---

## 11. 참고 자료

- [Sui Ed25519 Module](https://docs.sui.io/references/framework/sui_sui/ed25519)
- [Sui Sponsored Transactions](https://docs.sui.io/guides/developer/sui-101/sponsor-txn)
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/typescript)
- [@noble/ed25519](https://github.com/paulmillr/noble-ed25519)
- [Nautilus Tamper-Proof Oracles](https://blog.sui.io/nautilus-tamper-proof-oracles/)
