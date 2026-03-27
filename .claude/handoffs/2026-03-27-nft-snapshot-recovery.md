# Handoff: NFT Snapshot & Recovery System

**생성**: 2026-03-27 20:00
**브랜치**: feat/pado-scratchcard
**이전 핸드오프**: 없음

## 현재 상태 요약

Nasun devnet 리셋 시 사용자 NFT 소실을 방지하기 위한 스냅샷/복구 시스템을 구현했다.
ETH NFT 소유권 일일 스냅샷(소프트스테이킹 기반)과 Devnet NFT 온디맨드 백업/복원 두 가지 목적을 가진다.
CDK 인프라, Move 컨트랙트 admin_restore 함수, 복구 스크립트까지 전부 작성 완료. 아직 커밋/배포하지 않음.

## 완료된 작업

- [x] CDK 스택 생성 (`nft-snapshot-stack.ts`) - DynamoDB + 2 Lambda + EventBridge + Alarm
- [x] ETH NFT Collector Lambda (`eth-collector.ts`) - Alchemy API로 일일 소유권 스냅샷
- [x] Devnet NFT Collector Lambda (`devnet-collector.ts`) - Nasun RPC로 7종 NFT 스냅샷
- [x] `cdk/bin/cdk.ts`에 NftSnapshotStack 등록
- [x] `proposal.move`에 `admin_restore_vote_proof` + batch 추가 (AdminCap 게이팅)
- [x] `multi_choice_proposal.move`에 `admin_restore_vote_proof` + batch 추가 (AdminCap 게이팅)
- [x] `baram.move`에 `admin_restore_receipt` 추가 (UpgradeCap 게이팅)
- [x] `beta_access.move`에 `admin_restore_beta_access` 추가 (BetaAccessAdmin 게이팅)
- [x] governance, baram 패키지 `nasun move build` 성공
- [x] `restore-nfts.ts` 복구 스크립트 작성

## 미완료 작업

- [ ] CDK 배포 (`NODE_ENV=development npx cdk deploy NftSnapshotStack`)
- [ ] ETH 스냅샷 수동 실행 및 데이터 검증
- [ ] Move 컨트랙트 배포 (sui client upgrade 또는 리셋 후 재배포)
- [ ] 복구 스크립트 `--dry-run` 테스트
- [ ] 변경사항 커밋

## 중요 컨텍스트

### 시스템 구조 (2파트)

**Part A - ETH NFT 소유권 스냅샷 (일일 크론)**
- 목적: Battalion/Genesis 등 ETH NFT 소유자를 매일 DynamoDB에 기록
- 추후 소프트스테이킹 기간 계산에 활용
- Alchemy `getNFTsForOwner` API 사용
- `nasun-nft-collections` 테이블에서 추적 대상 컬렉션 조회
- `UserProfiles` 테이블에서 ETH 지갑 연결된 사용자 조회
- EventBridge: 매일 01:00 UTC

**Part B - Devnet NFT 백업 & 복원 (온디맨드)**
- 목적: devnet 리셋 전에 NFT 보유 현황을 스냅샷, 리셋 후 재발행
- `suix_queryEvents`로 민트 이벤트 디스커버리 -> `sui_multiGetObjects`로 상태 조회
- 복구 대상: BetaAccessNFT, RequestReceipt, VoteProofNFT, MultiChoiceVoteProofNFT (4종)
- 스냅샷만 (복구 안 함): Ticket, ScratchCard, ExecutionComplianceRecord (3종)

### DynamoDB 테이블: `nasun-nft-ownership`

```
PK                    | SK                        | 용도
ETH#{date}            | WALLET#{walletAddress}    | ETH NFT 소유권
ETH#LATEST            | WALLET#{walletAddress}    | 최신 ETH 스냅샷
DEVNET#{date}         | NFT#{objectId}            | Devnet NFT 스냅샷
DEVNET#LATEST         | NFT#{objectId}            | 최신 Devnet 스냅샷
META                  | ETH#{date}                | ETH 스냅샷 메타
META                  | DEVNET#{date}             | Devnet 스냅샷 메타
```

GSI: `wallet-date-index` (PK=walletAddress, SK=snapshotDate)

### 결정사항

- **RequestReceipt 복원 시 UpgradeCap 게이팅**: baram 모듈에 AdminCap이 없어서 UpgradeCap 사용
- **Ticket/ScratchCard 복원 안 함**: 복권은 라운드 종속이라 복원 의미 없음
- **originalPackageId 사용**: Sui 타입 쿼리는 최초 배포 packageId를 사용해야 함
- **배치 크기 50**: 가스 안전 마진 고려 (PTB 최대 1024 커맨드이지만 50이 안전)
- **VoteProofNFT는 `key` only** (store 없음): `transfer::transfer` 사용 (모듈 내부에서만 가능)

### 주의사항

- devnet 리셋 전 반드시 devnet-collector 실행해야 스냅샷 보존됨
- 리셋 후 컨트랙트 재배포 시 devnet-ids.json 업데이트 필수
- lottery/scratchcard Move.toml의 `address = "0x0"`은 업그레이드 시 실제 주소로 변경 필요

## 생성된 파일

```
apps/nasun-website/cdk/lib/nft-snapshot-stack.ts              # CDK 스택
apps/nasun-website/cdk/lambda-src/nft-snapshot/
  src/types.ts                                                 # 공유 타입
  src/eth-collector.ts                                         # ETH NFT 일일 수집
  src/devnet-collector.ts                                      # Devnet NFT 온디맨드 수집
  scripts/restore-nfts.ts                                      # 복구 스크립트
```

## 수정된 파일

```
apps/nasun-website/cdk/bin/cdk.ts                              # NftSnapshotStack 등록
apps/nasun-website/contracts/governance/sources/proposal.move   # admin_restore_vote_proof + batch
apps/nasun-website/contracts/governance/sources/multi_choice_proposal.move  # 동일
apps/baram/contracts/sources/baram.move                        # admin_restore_receipt
apps/baram/contracts/sources/beta_access.move                  # admin_restore_beta_access
```

## admin_restore 함수 요약

| 함수 | 컨트랙트 | 게이팅 | 설명 |
|------|---------|--------|------|
| `admin_restore_vote_proof` | governance::proposal | AdminCap | VoteProofNFT 복원 (single + batch) |
| `admin_restore_vote_proof` | governance::multi_choice_proposal | AdminCap | MultiChoiceVoteProofNFT 복원 (single + batch) |
| `admin_restore_receipt` | baram::baram | UpgradeCap | RequestReceipt 복원 |
| `admin_restore_beta_access` | baram::beta_access | BetaAccessAdmin | BetaAccessNFT 복원 (issued_at 보존) |

모든 함수는 정상 비즈니스 로직(결제, 투표, 에스크로 등)을 우회하여 스냅샷 데이터로 NFT를 직접 생성.

## 즉시 다음 단계

1. 변경사항 커밋 (feat: add NFT snapshot & recovery system)
2. CDK 배포: `NODE_ENV=development npx cdk deploy NftSnapshotStack`
3. Move 컨트랙트 업그레이드 배포 (선택: 지금 또는 리셋 시)
4. ETH 스냅샷 수동 실행으로 데이터 검증

## 플랜 파일 참조

상세 설계는 `.claude/plans/sunny-pondering-rossum.md`에 기록되어 있었으나 이 핸드오프가 최신 상태를 반영함.
