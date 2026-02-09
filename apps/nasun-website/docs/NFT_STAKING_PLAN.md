# Battalion NFT Utility & Staking System Plan

## Context

Nasun은 Sui fork L1이지만 현재 devnet(2노드)만 운영 중. Ethereum OpenSea에서 Battalion NFT/Genesis NFT를 드롭 예정이고, 메인넷 TGE는 NFT 판매 후 1년+ 소요. 그 사이 NFT 홀더 유지/보상을 위한 유틸리티와 스테이킹 시스템이 필요.

**상태**: NFT 컨트랙트 아직 미배포 → Sepolia testnet 기반으로 개발/테스트
**구현 범위**: Part 1 Tier 1 전체 유틸리티 + Part 2 스테이킹 시스템
**배수 공식**: 시스템 구조만 먼저 구현, 구체적 수치는 config로 분리하여 나중에 결정

---

## Part 1: Battalion NFT Pre-Mainnet Utility 전략

> **핵심 가치**: "Wait with Value" — 기다림이 곧 가치가 되는 구조
>
> 시각적 보상(배지, 진화)으로 과시욕을 충족시키고,
> 참여적 보상(투표, 베타 테스트)으로 소속감을 주며,
> 경제적 예약 보상(TGE 배수, 도메인 선점)으로 장기 보유의 이유를 정당화한다.

### 핵심 원칙
- NFT는 Ethereum 위에 있고, 앱은 Nasun devnet 위에서 동작
- MetaMask 인증은 이미 nasun.io에 구현됨 (challenge-response, EIP-191)
- AWS Lambda + DynamoDB 인프라 활용 (거의 무료)
- 2인 팀이 12개월+ 유지 가능한 범위
- Nasun 고유 기술 스택(Pado DEX, Baram AI TEE, GenSol 게임)을 활용한 차별화

### 유틸리티 전체 우선순위

| 순위 | 유틸리티 | 카테고리 | 공수 | 효과 |
|------|---------|---------|------|------|
| 1 | Staking + Dynamic Badge | Economic / Social | High | Very High |
| 2 | NNS (.nasun) 도메인 선점 | Identity | Low | Very High |
| 3 | Holder-Only Dev Log + Treasury 투명성 | Governance | Minimal | Medium |
| 4 | Baram Private Mode (TEE) 체험 | Product Access | Low | High |
| 5 | Holder Access Gate | Access | Low | Medium |
| 6 | Devnet Achievement SBTs | Gamification | Medium | High |
| 7 | GenSol Exclusive Preview | Content | Low | Medium |
| 8 | Pado Point Multiplier | Economic | Medium | Medium |
| 9 | Governance Voting (Holder-Weighted) | Governance | Medium | Medium |

---

### Tier 1: 스테이킹과 함께 즉시 구현

#### 1.1 NFT Staking & TGE Multiplier + Dynamic Badge Aura
- NFT를 "소프트 스테이킹"하여 누적 일수 추적
- 스테이킹 일수에 따라 TGE 시 토큰 할당 배수 증가
- **진화형 등급 배지**: 스테이킹 기간에 따라 배지 아이콘 주변의 시각적 이펙트(Aura)가 진화
  - Bronze(30일): 기본 아이콘
  - Silver(7일): 은색 테두리
  - Gold(30일): 금색 글로우
  - Platinum(90일): 플래티넘 불꽃 이펙트
  - Diamond(180일): 다이아몬드 프리즘
  - Obsidian(365일): 흑요석 오라 + 애니메이션
- Pado 글로벌 채팅, 리더보드, nasun.io 프로필에서 즉시 반영 → 비보유자에게 FOMO 유발
- **상세 설계는 Part 2 참조**

#### 1.2 NNS (Nasun Name Service) 도메인 선점

메인넷 런칭 시 `.nasun` 도메인 서비스를 배포할 예정. NFT 스테이커에게 희귀 도메인을 사전 예약할 권리를 부여.

- **스테이킹 등급별 예약 차등**:
  - Obsidian (365일+): 3글자 이하 초희귀 핸들 (예: `naru.nasun`, `sol.nasun`)
  - Diamond (180일+): 4글자 핸들
  - Platinum (90일+): 5글자 핸들
  - Gold (30일+): 6글자 이상 핸들
- 예약된 핸들은 스테이킹 대시보드와 채팅 배지에 즉시 표시 → Nasun 생태계 통합 ID
- 메인넷 런칭 시 예약 테이블 기반으로 화이트리스트 민팅
- **구현**: DynamoDB 테이블 (`nasun-nns-reservations`, PK: walletAddress, SK: handle) + 예약 UI 페이지. 중복 검사 GSI (PK: handle).
- **복잡도**: Low
- **왜 강력한가**: "내 이름을 선점할 수 있다"는 동기는 검증된 L1 킬러 유틸리티 (ENS, SNS 등). 스테이킹 기간이 길수록 더 희귀한 이름을 가져갈 수 있어 장기 보유를 강하게 유도.

#### 1.3 Holder-Only Access Gate + Dev Log + Treasury 투명성

nasun.io에서 NFT 보유 확인 후 전용 콘텐츠/기능 잠금 해제.

- **Holder-Only Dev Log**: 개발팀이 작성하는 상세 주간 개발 로그, 메인넷 인프라 설정 방향, 기술적 의사결정 과정 등 비공개 문서 접근 권한
- **Treasury 투명성 대시보드**: 프로젝트 재정 현황 (월간 AWS 비용, 개발 마일스톤, 런웨이, NFT 판매 수익 사용 내역) 공개. "숨기는 것이 없다" → 부트스트랩 스타트업의 약점을 투명성으로 강점 전환
- **얼리 액세스 공지**: 새로운 기능 출시 전 홀더에게 선공개
- 구현: Alchemy `getNFTsForOwner()` → DynamoDB 캐싱 (24h TTL)
- 복잡도: **Low** (기존 MetaMask auth + Alchemy API call 추가)
- **구현 방식**:
  - 새 Lambda: `nasun-nft-holder-verify` — walletAddress로 Alchemy 호출, 결과 DynamoDB 캐싱
  - 프론트엔드: `useHolderStatus()` hook → 인증된 사용자의 NFT 보유 여부 반환
  - 게이트 컴포넌트: `<HolderGate>` wrapper — 비보유자에게 "Battalion NFT holders only" 메시지 표시
  - 스테이킹 API의 Alchemy 호출을 공유하여 중복 제거
  - Dev Log / Treasury 콘텐츠는 마크다운 페이지로 관리 (추가 인프라 불필요)

#### 1.4 Baram AI Private Mode (TEE) 체험

Baram의 TEE(Trusted Execution Environment) 기반 프라이버시 추론을 홀더 전용으로 개방.

- 일반 유저: Standard 모드 (Lambda → Groq API) 만 사용 가능
- NFT 홀더: **Private 모드** — 프롬프트가 RSA-OAEP + AES-256-GCM으로 암호화되어 TEE 내부에서만 복호화/처리
- 프론트엔드에 암호화 증거 시각화: "Your prompt was encrypted and processed inside a Trusted Execution Environment"
- **왜 차별화되는가**: "AI + 블록체인" 프로젝트는 많지만, TEE 프라이버시 추론을 실제 시연할 수 있는 프로젝트는 거의 없음. 홀더가 직접 체험하면 Nasun의 기술력을 체감하게 되고, 이것이 자연스러운 입소문 마케팅이 됨
- **구현**: 기존 Baram frontend 모드 선택에 NFT 홀더 체크 추가. Beta Access 시스템 (`beta_access.move`) 이미 존재하므로 연동만 필요
- **복잡도**: Low

---

### Tier 2: 스테이킹 시스템 안정화 후 구현 (1-2개월)

#### 2.1 Nasun Devnet Achievement SBTs (Soulbound Tokens)

Ethereum 위의 Battalion NFT와 Nasun devnet을 연결하는 다리. 홀더가 생태계 내 특정 행동을 완료하면 Nasun devnet에 양도 불가 토큰(SBT)을 민팅.

- "First Trade on Pado" — Pado에서 첫 거래 완료
- "Governance Voter" — 거버넌스 투표 3회 참여
- "Diamond Staker" — 180일 연속 스테이킹 달성
- "AI Pioneer" — Baram에서 AI 추론 10회 실행
- "Bug Hunter" — 유효한 버그 리포트 제출
- "Domain Secured" — NNS 도메인 예약 완료
- **왜 차별화되는가**: 대부분의 NFT 유틸리티는 "Ethereum에서 NFT 보유 → 오프체인 혜택"으로 끝남. 이 시스템은 홀더가 **실제로 Nasun L1 체인을 사용하게 만들어**, 메인넷 런칭 시 이미 체인에 익숙한 유저 베이스를 확보
- **구현**: Move 컨트랙트 (SBT 민팅 + Achievement Registry) + Lambda에서 조건 충족 시 자동 민팅 + 프론트엔드 Achievement Gallery 페이지
- **복잡도**: Medium

#### 2.2 GenSol Exclusive Preview & Playtest Sessions

GenSol IP 콘텐츠를 홀더 전용으로 선공개.

- 매월 1회 GenSol 슈터 게임의 **홀더 전용 플레이테스트** 세션
- 새 캐릭터/맵/스토리 아트를 HolderGate 뒤에서 먼저 공개
- 플레이테스트 참여자에게 스테이킹 보너스 일수 부여 (예: 참여 1회 = +3일)
- **왜 차별화되는가**: 실제 동작하는 게임의 미공개 빌드를 플레이하게 함으로써, "실행력 있는 팀"이라는 증거 제시
- **구현**: HolderGate + 빌드 다운로드 링크. 인프라 비용 없음
- **복잡도**: Low (콘텐츠 일정에 의존)

#### 2.3 Pado 리더보드 포인트 부스팅

Pado DEX 리더보드 V3에서 거래량 기반 포인트 적립 시, 스테이킹 중인 홀더에게 배수 적용.

- Battalion NFT 스테이킹 중: 획득 포인트 1.5x
- Obsidian 등급 (365일+): 획득 포인트 2.0x
- 적립된 포인트는 메인넷 TGE 시 토큰 할당에 추가 반영
- **구현**: Pado 프론트엔드에서 `useHolderStatus()` 확인 → 리더보드 포인트 계산 Lambda에 배수 필드 추가
- **복잡도**: Medium

#### 2.4 Governance Voting (Holder-Weighted)

기존 거버넌스 시스템에 NFT 보유자 가중 투표 도입. EIP-712 서명 기반 (가스비 없음).

- 안건 예시: Pado 신규 기능 우선순위, GenSol 캐릭터 이름 공모, 인프라 확장 방향
- Battalion NFT 1개 = 추가 투표 가중치
- 투표 참여 시 Achievement SBT 조건 충족
- **구현**: 기존 거버넌스 Lambda에 NFT 체크 로직 추가
- **복잡도**: Medium

### Tier 3: Future (3개월+, 별도 기획)

- **Daily Check-In Streak**: 매일 서명으로 streak 누적, 연속 출석 보너스
- **Baram AI Daily Allowance**: 홀더에게 매일 무료 AI 추론 쿼리 할당량 제공
- **Referral System**: 홀더 전용 추천 링크, 추천인/피추천인 모두 보너스 스테이킹 일수 부여
- **Community Quest System**: 주간/월간 퀘스트 (Pado 거래, 투표, 소셜 공유 등) 완료 시 포인트

---

## Part 2: NFT Staking System 설계

### 접근방식: Option C — Hybrid (EIP-712 Commitment + Off-Chain Tracking)

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|------|
| A: Pure Off-Chain | 구현 간단 | 암호학적 증거 없음, 감사 불가 | X |
| B: Ethereum 컨트랙트 | 온체인 확실성 | 가스비($5-30/액션), 커스터디 리스크 | X |
| **C: EIP-712 + Off-Chain** | **가스비 0, 증거 보존, 소프트 스테이킹** | 오프체인 DB 의존 | **채택** |

- **소프트 스테이킹**: NFT가 사용자 지갑에 그대로 남음 (전송/잠금 없음)
- **EIP-712 서명**: 구조화된 데이터 서명으로 스테이킹 의사 증명 (MetaMask에서 읽기 쉬운 형태로 표시)
- **매일 소유권 검증**: Alchemy API로 NFT 보유 여부 확인
- **비용**: AWS 무료 티어 범위 내 ($0-1/월)

### System Architecture

```
                    FRONTEND (nasun.io/wave1/nft-staking)
               ┌────────────────────────────────────────┐
               │  NftStakingPage                         │
               │  ├── StakingOverviewCard (총 배수/일수) │
               │  ├── NftStakingList (NFT별 상태)        │
               │  ├── MultiplierTierChart (배수 표)      │
               │  └── StakeButton (EIP-712 서명)         │
               └──────────────┬─────────────────────────┘
                              │
               ┌──────────────▼─────────────────────────┐
               │  API Gateway  /staking/*                 │
               └──────────────┬─────────────────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
   ┌────▼────┐          ┌────▼────┐           ┌─────▼─────┐
   │ stake   │          │ status  │           │ unstake   │
   │ Lambda  │          │ Lambda  │           │ Lambda    │
   │         │          │         │           │           │
   │ EIP-712 │          │ Query   │           │ EIP-712   │
   │ verify  │          │ DynamoDB│           │ verify    │
   │ +Alchemy│          │ +calc   │           │ +calc days│
   └────┬────┘          └────┬────┘           └─────┬─────┘
        │                    │                      │
   ┌────▼────────────────────▼──────────────────────▼────┐
   │  DynamoDB                                            │
   │  ├── nasun-nft-staking (메인 상태)                   │
   │  ├── nasun-nft-staking-history (감사 로그)           │
   │  └── nasun-nft-staking-snapshots (일별 스냅샷)       │
   └─────────────────────────────────────────────────────┘
                              │
   ┌──────────────────────────▼──────────────────────────┐
   │  EventBridge → Daily Verification Lambda (매일 0시)  │
   │  Alchemy getNFTsForOwner() → 소유권 확인/갱신        │
   └─────────────────────────────────────────────────────┘
```

### EIP-712 Typed Data 구조

```typescript
const STAKING_DOMAIN = {
  name: 'Nasun Battalion NFT Staking',
  version: '1',
  chainId: 1,  // Ethereum mainnet (Sepolia: 11155111 for dev)
};

const STAKING_TYPES = {
  StakeCommitment: [
    { name: 'action', type: 'string' },         // 'STAKE' | 'UNSTAKE'
    { name: 'walletAddress', type: 'address' },
    { name: 'contractAddress', type: 'address' },
    { name: 'tokenIds', type: 'uint256[]' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },          // replay 방지
  ],
};
```

### DynamoDB Schema

#### Table 1: `nasun-nft-staking` (메인 상태)

| 속성 | 키 | 설명 |
|------|-----|------|
| `walletAddress` | PK | Ethereum 지갑 주소 (lowercase) |
| `tokenId` | SK | NFT 토큰 ID |
| `contractAddress` | - | NFT 컨트랙트 주소 |
| `status` | - | `STAKED` / `UNSTAKED` |
| `stakedAt` | - | 스테이킹 시작 시각 (ISO 8601) |
| `totalStakedDays` | - | 누적 스테이킹 일수 |
| `currentStreakStart` | - | 현재 연속 스테이킹 시작일 |
| `lastVerifiedAt` | - | 마지막 소유권 확인 시각 |
| `lastVerifiedOwner` | - | 마지막 확인 시 보유 여부 |
| `stakingSignature` | - | EIP-712 서명 (증거) |
| `stakingMessage` | - | 서명된 EIP-712 typed data JSON |
| `unstakedAt` | - | 언스테이크 시각 (null if staked) |
| `unstakingSignature` | - | 언스테이크 EIP-712 서명 |
| `updatedAt` | - | 마지막 업데이트 시각 |

**GSI 1**: `status-index` (PK: status, SK: lastVerifiedAt) — 일일 검증 크론용
**GSI 2**: `contractAddress-tokenId-index` (PK: contractAddress, SK: tokenId) — 동일 NFT 중복 스테이킹 방지

#### Table 2: `nasun-nft-staking-history` (Append-Only 감사 로그)

| 속성 | 키 | 설명 |
|------|-----|------|
| `walletAddress` | PK | 지갑 주소 |
| `eventTimestamp` | SK | 이벤트 시각 + random suffix |
| `eventType` | - | `STAKE`/`UNSTAKE`/`OWNERSHIP_LOST`/`OWNERSHIP_REGAINED`/`VERIFICATION_PASS` |
| `tokenId` | - | 토큰 ID |
| `contractAddress` | - | 컨트랙트 주소 |
| `signature` | - | EIP-712 서명 (STAKE/UNSTAKE 시) |
| `details` | - | JSON 추가 정보 |

#### Table 3: `nasun-nft-staking-snapshots` (일별 스냅샷)

| 속성 | 키 | 설명 |
|------|-----|------|
| `snapshotDate` | PK | `YYYY-MM-DD` |
| `walletAddress_tokenId` | SK | `{addr}#{tokenId}` |
| `walletAddress` | - | 조회용 |
| `tokenId` | - | 조회용 |
| `ownershipVerified` | - | 소유권 확인 여부 |
| `cumulativeDays` | - | 누적 일수 |

**GSI**: `walletAddress-index` (PK: walletAddress, SK: snapshotDate) — 사용자별 히스토리 조회

### API Endpoints

| Method | Path | Lambda | 설명 |
|--------|------|--------|------|
| `POST` | `/staking/stake` | `nasun-staking-stake` | EIP-712 서명으로 스테이킹 시작 |
| `POST` | `/staking/unstake` | `nasun-staking-unstake` | EIP-712 서명으로 스테이킹 해제 |
| `GET` | `/staking/status?wallet=0x...` | `nasun-staking-status` | 스테이킹 현황 + 배수 조회 |
| `GET` | `/staking/stats` | `nasun-staking-stats` | 전체 통계 |
| `GET` | `/staking/leaderboard` | `nasun-staking-leaderboard` | 상위 스테이커 (선택) |
| `GET` | `/holder/verify?wallet=0x...` | `nasun-nft-holder-verify` | NFT 보유 확인 (Holder Gate/Badge용) |
| - | EventBridge cron | `nasun-staking-verify-ownership` | 일일 소유권 검증 |

### Token Allocation Multiplier

**구조만 먼저 구현, 구체적 수치는 config로 분리:**

```typescript
// Lambda 환경변수 또는 DynamoDB config 테이블에서 로드
interface MultiplierConfig {
  tiers: Array<{
    minDays: number;
    additionalMultiplier: number;
    label: string;
  }>;
  multiNftBonusPerNft: number;  // 추가 NFT당 보너스
  multiNftCap: number;           // 최대 NFT 개수
  maxMultiplier: number;         // 최대 배수 캡
}

// 기본값 (나중에 조정 가능)
const DEFAULT_CONFIG: MultiplierConfig = {
  tiers: [
    { minDays: 1,   additionalMultiplier: 0.1, label: 'Bronze' },
    { minDays: 7,   additionalMultiplier: 0.1, label: 'Silver' },
    { minDays: 30,  additionalMultiplier: 0.2, label: 'Gold' },
    { minDays: 90,  additionalMultiplier: 0.3, label: 'Platinum' },
    { minDays: 180, additionalMultiplier: 0.3, label: 'Diamond' },
    { minDays: 365, additionalMultiplier: 0.5, label: 'Obsidian' },
  ],
  multiNftBonusPerNft: 0.1,
  multiNftCap: 5,
  maxMultiplier: 3.0,
};

function calculateMultiplier(
  totalStakedDays: number,
  nftCount: number,
  config: MultiplierConfig
): number {
  let multiplier = 1.0;
  for (const tier of config.tiers) {
    if (totalStakedDays >= tier.minDays) multiplier += tier.additionalMultiplier;
  }
  const effectiveNfts = Math.min(nftCount, config.multiNftCap);
  multiplier += (effectiveNfts - 1) * config.multiNftBonusPerNft;
  return Math.min(multiplier, config.maxMultiplier);
}
```

### Anti-Gaming 조치

1. **Sell-and-Rebuy**: `contractAddress-tokenId-index` GSI로 토큰 단위 추적. NFT 판매 시 일일 검증에서 소유권 상실 감지 → 강제 언스테이크. 같은 토큰을 다른 지갑이 다시 스테이킹하면 0일부터 시작.
2. **Signature Replay**: nonce + 5분 TTL (기존 MetaMask auth 패턴 동일)
3. **Flash Staking**: 최소 1일 경과 후 첫 검증 통과 시 1일 카운트
4. **Sybil**: 배수는 NFT 단위. 10개 지갑 × 1NFT = 1개 지갑 × 10NFT와 동일 효과

### Daily Verification Flow (EventBridge Cron)

```
00:00 UTC → Orchestrator Lambda 실행
  → DynamoDB status=STAKED 전체 조회 (status-index GSI)
  → walletAddress별 그룹핑 (Alchemy 호출 최소화)
  → 500 wallets씩 배치로 SQS에 전송
  → Worker Lambda(들)이 병렬 처리:
    → Alchemy getNFTsForOwner() 호출 (200ms 간격)
    → 소유 확인: totalStakedDays++, 스냅샷 기록, VERIFICATION_PASS 이벤트
    → 소유 상실: status=UNSTAKED, OWNERSHIP_LOST 이벤트 기록
    → API 실패 시: VERIFICATION_SKIPPED (패널티 없음, 다음날 재시도)
```

**스케일링 분석 (2000 NFT 기준)**:
- Alchemy CU: 2000 wallets × 30일 × 50CU = 3M CU/월 (Free tier 5M의 60%) → OK
- 단일 Lambda 시간: 2000 wallets × 200ms = 400초 → Lambda 5분 timeout 초과
- **해결**: SQS fan-out으로 Phase 1부터 구현. 4 workers × 500 wallets = 100초/worker → 안전
- SQS + 추가 Lambda 비용: 월 $0.10 미만

### Mainnet Migration Path

1. **Pre-TGE**: 오프체인 DynamoDB + EIP-712 서명으로 운영
2. **TGE 시점**: 최종 스냅샷 → Merkle tree 생성 → root를 Nasun mainnet에 게시
3. **Post-TGE**: Nasun mainnet에 Claim 컨트랙트 배포 → Merkle proof로 토큰 수령
4. **Future**: 필요 시 온체인 네이티브 스테이킹 시스템으로 전환

### Cost Estimate

| 서비스 | 500 stakers 기준 | 월 비용 |
|--------|-----------------|---------|
| DynamoDB (on-demand) | ~50K RCU + 20K WCU | ~$0.50 |
| Lambda | ~15K invocations | ~$0.10 |
| API Gateway | ~30K calls | ~$0.10 |
| Alchemy API | Free tier (5M CU) | $0 |
| **Total** | | **~$0.70/month** |

---

## Implementation Sequence

### Phase 0: Documentation
- 이 플랜 문서를 `apps/nasun-website/docs/NFT_STAKING_PLAN.md`로 저장

### Phase 1: CDK Infrastructure (`staking-stack.ts`)
- [nft-event-stack.ts](apps/nasun-website/cdk/lib/nft-event-stack.ts) 패턴 복제
- DynamoDB 3개 테이블 + GSI 정의
- Lambda 함수 7개 정의 (stake, unstake, status, stats, leaderboard, holder-verify, verify-ownership)
- API Gateway REST endpoints
- EventBridge 일일 크론 규칙
- Alchemy API key → Secrets Manager
- [cdk.ts](apps/nasun-website/cdk/bin/cdk.ts)에 새 스택 등록

### Phase 2: Backend Lambda Functions
1. **공통 유틸리티**: EIP-712 `verifyTypedData()` + Alchemy NFT 조회 + DynamoDB 헬퍼
   - 참조: [ethereum.ts](apps/nasun-website/cdk/lambda-src/auth-metamask/src/utils/ethereum.ts)
2. **`nasun-staking-stake`**: EIP-712 검증 → Alchemy NFT 소유 확인 → DynamoDB 레코드 생성
3. **`nasun-staking-unstake`**: EIP-712 검증 → 일수 계산 → 상태 업데이트
4. **`nasun-staking-status`**: walletAddress로 전체 스테이킹 현황 + 배수 계산
5. **`nasun-staking-stats`**: 전체 통계 (총 staker 수, 총 NFT 수, 평균 일수)
6. **`nasun-nft-holder-verify`**: NFT 보유 확인 (Holder Gate/Badge용, 캐시 24h)
7. **`nasun-staking-verify-ownership`**: EventBridge cron — 일일 소유권 검증 + 스냅샷

### Phase 3: Frontend — Staking
신규 파일:
- `utils/eip712Utils.ts`: MetaMask `eth_signTypedData_v4` 호출 유틸리티
  - 참조: [metamaskUtils.ts](apps/nasun-website/frontend/src/utils/metamaskUtils.ts)의 `signMessage()` 패턴
- `types/staking.ts`: 스테이킹 관련 타입 정의
- `services/stakingApi.ts`: API 클라이언트
- `hooks/staking/useStakingStatus.ts`: TanStack Query GET /staking/status
- `hooks/staking/useStake.ts`: Mutation POST /staking/stake (EIP-712 서명 + API)
- `hooks/staking/useUnstake.ts`: Mutation POST /staking/unstake
- `sections/wave1/nft-staking/NftStakingDashboard.tsx`: 메인 대시보드
- `sections/wave1/nft-staking/StakingOverviewCard.tsx`: 요약 (총 배수, 총 일수, 티어)
- `sections/wave1/nft-staking/NftStakingList.tsx`: NFT 목록 + 개별 stake/unstake
- `sections/wave1/nft-staking/MultiplierTierChart.tsx`: 배수 티어 시각화
- `sections/wave1/nft-staking/StakingInfoCard.tsx`: 설명 카드
- `pages/wave1/NftStakingPage.tsx`: 페이지 컴포넌트
- [routesConfig.ts](apps/nasun-website/frontend/src/config/routesConfig.ts)에 `/wave1/nft-staking` 라우트 추가

### Phase 4: Frontend — Holder Gate & Badge
신규 파일:
- `hooks/useHolderStatus.ts`: NFT 보유 여부 조회
- `components/HolderGate.tsx`: NFT 보유자 전용 콘텐츠 게이트
- `components/HolderBadge.tsx`: 배지 컴포넌트 (Battalion Holder/Staker/Tier)
수정 파일:
- 리더보드, 프로필 컴포넌트에 `<HolderBadge>` 삽입
- Pado chat-server: badge 정보 전달 (별도 구현 가능)

### Phase 5: Testing
- Sepolia testnet에 테스트 ERC-721 컨트랙트 배포 (또는 기존 테스트 NFT 사용)
- 전체 플로우 E2E: MetaMask 연결 → NFT 확인 → 스테이크 → 일일 검증 → 언스테이크
- Anti-gaming 시나리오: NFT 전송 후 검증, re-stake, 중복 스테이킹 시도
- Holder Gate: NFT 보유/미보유 상태에서 게이트 동작 확인

---

## Critical Files (수정/참조)

| 파일 | 용도 |
|------|------|
| [nft-event-stack.ts](apps/nasun-website/cdk/lib/nft-event-stack.ts) | CDK 스택 패턴 (DynamoDB + Lambda + API GW) |
| [ethereum.ts](apps/nasun-website/cdk/lambda-src/auth-metamask/src/utils/ethereum.ts) | ethers.js 서명 검증 → `verifyTypedData()` 확장 |
| [metamaskUtils.ts](apps/nasun-website/frontend/src/utils/metamaskUtils.ts) | MetaMask 유틸 → `signTypedDataV4()` 추가 |
| [routesConfig.ts](apps/nasun-website/frontend/src/config/routesConfig.ts) | 라우트 추가 |
| [cors.ts](apps/nasun-website/cdk/lib/constants/cors.ts) | CORS 설정 재사용 |
| [cdk.ts](apps/nasun-website/cdk/bin/cdk.ts) | CDK 앱 진입점 (새 스택 등록) |

## Verification

1. `cdk deploy StakingStack` → AWS 인프라 프로비저닝 확인
2. Sepolia testnet EIP-712 서명 → `/staking/stake` API → DynamoDB 레코드 확인
3. 일일 검증 Lambda 수동 실행 → 스냅샷 테이블 업데이트 확인
4. `/wave1/nft-staking` 페이지 → MetaMask 연결 → 스테이킹 전체 플로우 E2E
5. NFT 전송 후 일일 검증 → 강제 언스테이크 + OWNERSHIP_LOST 이벤트 확인
6. `/holder/verify` API → Holder Gate/Badge 동작 확인
7. `pnpm build:nasun-website` → 빌드 통과 확인
