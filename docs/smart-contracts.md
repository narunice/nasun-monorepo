# Smart Contracts Reference

## Nasun CLI

```bash
# nasun은 sui client의 alias (~/.bashrc에 정의)
alias nasun="/home/naru/my_apps/nasun-devnet/sui/target/release/sui"

# 직접 실행 시:
/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client publish
```

## 스마트컨트랙트 위치

| 디렉토리                          | 설명                                 |
| --------------------------------- | ------------------------------------ |
| `apps/baram/contracts/` (**archived**) | Baram 에스크로 + 정산 + Budget + BetaAccess. onchain 모듈명 invariant 유지 |
| `apps/baram/contracts-aer/` (archived) | AIExecutionReport (8카테고리, 31필드) |
| `apps/baram/contracts-agent/` (archived) | AgentProfile + Kill Switch |
| `apps/baram/contracts-executor/` (archived) | Executor 등록 + Staking + Tier |
| `apps/baram/contracts-attestation/` (archived) | PCR baseline 등록/검증 |
| `apps/baram/contracts-compliance/` (archived) | ECR (FROZEN) |
| `apps/pado/contracts/`            | DeepBook V3 (외부 배포 reference)    |
| `apps/pado/contracts-prediction/` | 예측 시장 (YES/NO 바이너리 orderbook) |
| `apps/pado/contracts-oracle/`     | DevOracle 가격 피드 (Binance 통합)   |
| `apps/pado/contracts-lending/`    | Lending V7 (UI 통합 대기)            |
| `apps/pado/contracts-lottery/`    | Pado Lottery (Sui Random)            |
| `apps/pado/contracts-margin/`     | Unified Margin v1 (Multi-collateral) |
| `apps/pado/contracts-perp/`       | Perpetuals (deprecated 검토)         |
| `apps/pado/contracts-nsa/`        | Nasun Smart Account (Multi-signer + Recovery) |
| `apps/pado/contracts-numbermatch/` | Number Match 게임 (Pado 잔존)        |
| `apps/pado/contracts-scratchcard/` | Scratch Card 게임 (Pado 잔존)        |
| `apps/gostop/contracts-bankroll-pool/` | gostop_bankroll_pool (v0.0.2 published, 게임 공용 풀) |
| `apps/gostop/contracts-crash/`    | gostop_crash (간판 게임)             |
| `apps/gostop/contracts-lottery/`  | gostop_lottery (v4, 5-of-25)         |
| `apps/gostop/contracts-mines/`    | gostop_mines (v4, 25-cell grid)      |
| `apps/gostop/contracts-numbermatch/` | gostop_numbermatch                |
| `apps/gostop/contracts-scratchcard/` | gostop_scratchcard                |
| `apps/gostop/contracts-wheel/`    | gostop_wheel (20 segment, RTP 97.5%) |
| `packages/devnet-tokens/`         | v1 공유 토큰 (NBTC, NUSDC, published-at `0x1c9357...362e7`) |
| `packages/devnet-tokens-v2/`      | v2 (coin type 통합 후 재배포)         |
| `packages/devnet-tokens-v2-neth/` | v2 ETH-pegged 변형 (NETH)            |

> **Why v1 tokens가 살아있는 이유**: 이미 배포된 컨트랙트들이 v1 published-at을 참조 중. Move 모듈명/published-at은 사실상 invariant. v2/v2-neth는 새 거래쌍 도입 시 별도 추가된 것.

> **Why gostop과 pado가 같은 게임명(Lottery/Scratch/NumberMatch)을 둘 다 둠**: Pado 측은 원래 자산. gostop 출시 시 Pado에서 이전했으나 Pado에 잔존하는 컨트랙트는 in-flight ticket 보호 + 사용자 데이터 보존 목적으로 즉시 archive하지 않음. 신규 round는 gostop_* 컨트랙트로 redirect.

## Move 빌드/배포 명령어

```bash
# 빌드
cd apps/pado/contracts
/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build

# 배포 (새 패키지)
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client publish --gas-budget 100000000

# 업그레이드 (기존 패키지)
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client upgrade \
  --upgrade-capability <UPGRADE_CAP_ID> \
  --gas-budget 100000000

# 환경 확인
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client envs
```

## 배포된 컨트랙트 (Devnet V7)

> **Chain ID**: `272218f1` (V7 리셋, 2026-02-04)
>
> 전체 컨트랙트 주소는 `packages/devnet-config/devnet-ids.json` 참조

| 카테고리   | 컨트랙트                                      | 상태           |
| ---------- | --------------------------------------------- | -------------- |
| Tokens     | devnet_tokens (NBTC, NUSDC, Faucet)           | V7             |
| Prediction | prediction (GlobalState)                      | V7             |
| Lottery    | lottery (LotteryRegistry)                     | V7             |
| Governance | governance (Dashboard)                        | V7             |
| DeepBook   | DeepBook V3 (CLOB)                            | V7             |
| Baram      | baram (BaramRegistry + Budget + BetaAccess)   | V7 (v6)        |
| Baram      | baram_aer (AERRegistry + AIExecutionReport)   | V7 (v3)        |
| Baram      | baram_agent (AgentProfileRegistry)            | V7             |
| Baram      | executor (ExecutorRegistry + Staking + Tier)  | V7             |
| Oracle     | pado_oracle                                   | V7             |
| Lending    | pado_lending                                  | V7             |
| Margin     | unified_margin                                | V7             |
| Perpetuals | pado_perp                                     | V7             |
