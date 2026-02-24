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
| `apps/baram/contracts/`              | Baram 에스크로 + 정산 + Budget + BetaAccess |
| `apps/baram/contracts-aer/`          | AIExecutionReport (8카테고리, 31필드) |
| `apps/baram/contracts-agent/`        | AgentProfile + Kill Switch (agent_profile.move) |
| `apps/baram/contracts-executor/`     | Executor 등록 + Staking + Tier    |
| `apps/baram/contracts-attestation/`  | PCR baseline 등록/검증         |
| `apps/baram/contracts-compliance/`   | ECR (FROZEN -- 기존 보존)       |
| `apps/pado/contracts/`            | NBTC, NUSDC 토큰 + Faucet            |
| `apps/pado/contracts-prediction/` | 예측 시장 컨트랙트                   |
| `apps/pado/contracts-oracle/`     | DevOracle 가격 피드                  |
| `apps/pado/contracts-lending/`    | 렌딩 컨트랙트                        |
| `apps/pado/contracts-lottery/`    | Lottery 컨트랙트 (Sui Random)        |
| `apps/pado/contracts-margin/`     | Unified Margin v1 (Multi-collateral) |
| `apps/pado/contracts-perp/`       | Perpetuals DEX                       |
| `apps/pado/contracts-nsa/`        | Nasun Smart Account (Multi-signer + Recovery) |
| `packages/devnet-tokens/`         | 공유 토큰 컨트랙트 (NBTC, NUSDC)     |

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
