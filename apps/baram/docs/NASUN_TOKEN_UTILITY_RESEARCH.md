# Nasun-Baram 가치 축적 아키텍처

> **작성일**: 2026-01-29
> **목적**: Baram dApp의 성장이 Nasun L1 토큰(NASUN) 가치 상승으로 구조적으로 이어지는 아키텍처 설계
> **전제**: Baram은 별도 토큰을 발행하지 않고, NASUN 네이티브 토큰으로 운영

---

## 한 문장 정의

> **Nasun은 AI 실행을 정산하는 L1이고,
> Baram은 Nasun 토큰의 실사용 수요를 가장 강하게 만들어내는 레퍼런스 dApp이다.**

Baram은 독립 앱처럼 보이지만, 경제적으로는 **Nasun 토큰의 Utility Engine** 역할을 수행한다.
이 전제 위에 모든 설계가 정렬된다.

---

## Part I. 왜 이 설계가 필요한가

### 이더리움의 교훈: L1 가치 유출

EIP-4844(Dencun, 2024.03) 이후 L2가 L1에 지불하는 수수료가 **90-98% 감소**.
Base는 하루 수십만 달러 매출을 올리면서 Ethereum에는 몇 달러만 지불.

| 지표 | 변화 |
|------|------|
| L1 수수료 점유율 | 60% -> 12% |
| 블롭 기본 수수료 | 최저 1 wei까지 하락 |
| ETH 공급 성장률 | 디플레이션 -> +0.22%로 반등 |
| L1 월간 수수료 | $100M -> $15M 이하 |

Vitalik 본인도 인정: "L2 중심 세계에서도 ETH가 가치를 축적하도록 명시적으로 설계해야 한다."

Cosmos ATOM은 앱체인 주권(sovereignty) 때문에 생태계 가치를 포착하지 못해 최고점 대비 -90% 하락.

### 실패 구조 vs 성공 구조

| 실패한 구조 | 성공한 구조 |
|------------|------------|
| dApp 가치가 토큰과 분리 | dApp 활동 = 토큰 수요 |
| 가스비 최소화 경쟁 | 가스/수수료가 가치 포착 |
| 앱 토큰 남발 | 네이티브 토큰 집중 |
| L1은 인프라, 가치는 외부 | L1이 경제 중심 |

**Nasun은 Solana/Avalanche/Berachain 계열에 서야 하고,
Ethereum/Cosmos 계열의 길을 의도적으로 피해야 한다.**

### 성공 사례

| 체인 | 핵심 메커니즘 | 결과 |
|------|-------------|------|
| **Solana** | 수수료 50% 소각, 70% 공급 스테이킹 | DEX 거래량 YTD $1.4T, SOL ETF 출시 |
| **Avalanche** | 수수료 100% 소각, 서브넷에 AVAX 필요 | 1.8M AVAX 소각, 일일 TX 50.4% 증가 |
| **Berachain** | PoL(Proof of Liquidity), 3토큰 모델 | 론칭 전 $3.1B 유동성 확보 |
| **Hyperliquid** | 수수료 97% 유저 재순환, 바이백 | 총 공급 8-9% 제거, 월 $100M+ 수익 |

---

## Part II. 리서치 기반 (근거)

### AI x Blockchain 토큰 모델

| 프로젝트 | 모델 | Nasun에 적용 가능한 인사이트 |
|---------|------|--------------------------|
| **Bittensor (TAO)** | dTAO: TAO가 모든 서브넷의 "진입 화폐". 70% 스테이킹 | NASUN을 모델 마켓플레이스의 기축 통화로 |
| **Morpheus (MOR)** | 1% 보유 = 1% 컴퓨트 접근 (Stake-to-Use) | 스테이킹 기반 추론 접근 모델 |
| **Render (RENDER)** | Burn-Mint Equilibrium: 사용 시 소각, 공급자에게 발행 | 결제 수수료 소각 메커니즘 |
| **Helium (HNT)** | HNT 소각 -> Data Credits (고정가) | 크레딧 시스템 참고 |
| **The Graph (GRT)** | 인덱서 스테이킹 + 쿼리 수수료 1% 소각 | Executor 스테이킹 계층화 |

### TEE + 블록체인 토큰 연결

| 프로젝트 | TEE 용도 | 토큰 연결 |
|---------|---------|----------|
| **Oasis (Sapphire)** | 기밀 EVM (Intel SGX) | ROSE로 가스/스테이킹 |
| **Phala Network** | GPU TEE 마켓플레이스 | PHA로 연산 접근/배포 |
| **Secret Network** | 암호화 스마트 컨트랙트 | SCRT로 가스/스테이킹 |
| **Flashbots** | MEV 보호, 블록 빌딩 | 토큰 없음 (순수 인프라) |
| **Ritual Network** | AI 추론 검증 | Infernet 결제 + EigenLayer |

### 토큰 가치 축적 메커니즘 분류

| 모델 | 메커니즘 | 장점 | 단점 | 사례 |
|------|---------|------|------|------|
| **Pay-to-Use** | 사용 시마다 토큰 소비 | 진입 장벽 낮음 | 토큰 속도 높음, 가격 불안정 | Gensyn |
| **Stake-to-Use** | 토큰 락업으로 서비스 접근 | 매도 압력 감소, 장기 보유 유도 | 진입 장벽 높음 | Morpheus |
| **Burn-and-Mint** | 사용 시 소각, 공급자에게 발행 | 사용량-가치 직접 연결 | 가격 변동 시 UX 불안정 | Render, Helium |

### "별도 토큰 없음" dApp 전략

| 프로젝트 | 기간 | 전략 | 결과 |
|---------|------|------|------|
| **Uniswap** | 2018-2020 | ETH만으로 2년간 최대 DEX 운영 | 이후 UNI retroactive airdrop |
| **OpenSea** | 전체 | ETH/WETH로 모든 거래 | 자체 토큰 미출시 |
| **Solana DeFi** | 다수 | SOL을 기본 매개로 사용 | L1 가치에 직접 기여 |

장점: 복잡성 감소, L1과 가치 정렬, 사용자 마찰 감소, 규제 리스크 감소, 제품 집중.

---

## Part III. 통합 아키텍처: NASUN 유틸리티 5대 축

### 핵심 원칙

> **Baram에서 '돈이 움직이는 모든 순간'에 NASUN이 반드시 개입한다.**

방식은 하나가 아니라 여러 층으로 설계한다.

```
    Baram 경제 활동
         |
    +----+----+----+----+----+
    |    |    |    |    |    |
   Gas  Stake Pay  Trust Gov
    |    |    |    |    |    |
    +----+----+----+----+----+
              |
         NASUN Token
              |
     Nasun Network L1 가치
```

---

### Axis 1: Gas & Settlement Base (이미 구현)

- 모든 온체인 행위 -> NASUN 가스
- Executor / Validator 스테이킹 -> NASUN
- **역할**: 기본 생존 수요. Baram 트랜잭션이 존재하는 한 NASUN 수요 발생

---

### Axis 2: Executor Economy (가장 강력한 축)

Executor = "컴퓨팅 자원으로 NASUN을 버는 참여자"

**스테이킹 계층화:**

| 티어 | 스테이킹 | 혜택 |
|------|---------|------|
| Bronze | 1,000 NASUN | 기본 참여, 표준 수수료 |
| Silver | 10,000 NASUN | 우선 작업 배정, 수수료 5% 보너스 |
| Gold | 50,000 NASUN | 최우선 배정, 수수료 15% 보너스, 거버넌스 투표권 |

**가치 흐름:**

```
Baram 트래픽 증가
  -> Executor 수익 증가
    -> NASUN 스테이킹 수요 증가
      -> 공급 락업
```

이것은 Bitcoin miner / Bittensor validator와 동일한 경제 구조.
기존 executor_staking.move를 확장하여 구현.

**참고**: The Graph (인덱서 스테이킹), Bittensor (서브넷 스테이킹)

---

### Axis 3: Payment & Burn Flywheel (가치 상승 핵심)

**결제 구조:**

- 기본 결제 단위: NUSDC (안정성)
- 대안 결제: NASUN (사용 시 할인 제공)
- NASUN 결제 금액의 일부 자동 소각

**수수료 분배:**

```
User pays (NUSDC or NASUN)
+-- 80%: Executor에게 지급
+-- 10%: 프로토콜 Treasury (개발/운영)
+--  5%: NASUN buyback & burn
+--  5%: NASUN 스테이커 보상 풀
```

**효과**: Baram 매출이 직접 NASUN 매수 압력 + 공급 감소로 전환.
L1 가치 포착의 정석.

**참고**: Avalanche (100% 소각), Uniswap UNIfication (buy-and-burn, 99.9% 찬성 통과)

---

### Axis 4: Stake-to-Use (토큰 속도 제어 장치)

이것은 "편의 기능"이 아니라 **토큰 속도(velocity) 제어 장치**.

| 티어 | 조건 | 혜택 |
|------|------|------|
| Free | 스테이킹 없음 | pay-per-use (NUSDC) |
| Basic | 100 NASUN 스테이킹 | 월 10회 무료 추론 |
| Pro | 1,000 NASUN 스테이킹 | 월 100회 무료 추론 |
| Unlimited | 10,000 NASUN 스테이킹 | 무제한 + 우선 처리 |

**핵심 전환:**

- "써서 팔기" (pay-per-use) -> 토큰이 빠르게 순환, 가치 축적 약함
- **"묶어두고 쓰기" (stake-to-use)** -> 장기 보유 유도, 매도 압력 구조적 감소

**참고**: Morpheus (1% 보유 = 1% 컴퓨트), Helium (HNT -> DC 크레딧)

---

### Axis 5: Trust & Attestation Bond (Baram 고유 무기)

**이것은 다른 체인들이 따라올 수 없는 Baram 고유의 가치 연결.**

TEE 신뢰를 "평판"이 아니라 **경제적 리스크**로 증명:

```
TEE 신뢰 보증 모델:
+-- Executor가 PCR baseline 등록 시 NASUN 보증금 예치
+-- Attestation 검증 실패 시 보증금 슬래싱
+-- 성공적 검증 누적 -> 보증금 일부 반환 + 평판 상승
+-- 높은 보증금 = 사용자 UI에서 "High Trust" 배지
```

**왜 고유한가**: 프라이버시(TEE) + 신뢰(Attestation) + 경제적 보증(NASUN 보증금)이
하나의 메커니즘에서 결합. 이것은 일반적인 DeFi 스테이킹과는 질적으로 다르다.

**참고**: Gensyn (솔버 보증금), Bittensor (밸리데이터 스테이킹)

---

## Part IV. 결론

### Baram의 정체

> **Baram은 토큰이 없는 앱이 아니라,
> Nasun 토큰을 너무 많이 쓰는 앱이다.**

NASUN이 수행하는 5가지 역할:

1. **Gas**: 모든 온체인 행위 (이미 적용)
2. **Staking**: Executor 스테이킹 + 사용자 Stake-to-Use
3. **Payment**: AI 추론 결제 수단 (NUSDC 대안)
4. **Trust Bond**: TEE attestation 경제적 보증
5. **Governance**: 스테이킹 티어에 따른 거버넌스 참여

### 단계별 실행

**지금~단기 (Baram 트래픽 = NASUN 수요 공식 성립):**

| 순서 | 항목 | 난이도 | 가치 영향 |
|------|------|--------|----------|
| 1 | Executor 스테이킹 계층화 (Axis 2) | 낮음 | 중간 |
| 2 | 프로토콜 수수료 buyback & burn (Axis 3) | 중간 | 높음 |
| 3 | NASUN 결제 옵션 + 할인 (Axis 3) | 중간 | 높음 |

**중기 (토큰 속도 감소 + 장기 보유 유도):**

| 순서 | 항목 | 난이도 | 가치 영향 |
|------|------|--------|----------|
| 4 | Attestation 보증금 (Axis 5) | 중간 | 중간 |
| 5 | Stake-to-Use 접근 모델 (Axis 4) | 높음 | 매우 높음 |

**장기 (생태계 확장):**

| 순서 | 항목 | 난이도 | 가치 영향 |
|------|------|--------|----------|
| 6 | Model Marketplace + NASUN 기축 | 높음 | 매우 높음 |

이 시점에서도 NASUN은 빠지지 않고 중심에 남아 있음.
향후 독립이 필요하면 서브토큰은 NASUN 위에서만 발행.

### 최종 정리

> **Ethereum은 "앱이 성공해도 토큰이 남지 않는 체인"이 되었고,
> Nasun은 "앱이 성공할수록 토큰이 잠기는 체인"이 되어야 한다.
> Baram은 그 구조를 증명하기 위한 첫 번째, 가장 중요한 실험이다.**

이 설계는:
- 이론적으로 맞고 (L1 value accrual 연구)
- 사례적으로 검증된 방향이며 (Solana, Bittensor, Morpheus, Render)
- 지금 이미 구현된 것들과 자연스럽게 이어진다 (executor_staking.move, baram.move)

---

## 참고 자료 (Sources)

### L1 Value Accrual

- [Fidelity: Fusaka Upgrade](https://www.fidelitydigitalassets.com/research-and-insights/fusaka-upgrade-scaling-meets-value-accrual)
- [Arkham: The State of Ethereum](https://info.arkm.com/research/the-state-of-ethereum-2025-digital-oil-l2s-tps-etfs-dats)
- [Vitalik: Scaling L1 and L2s](https://vitalik.eth.limo/general/2025/01/23/l1l2future.html)
- [Reflexivity: L2 Debate](https://www.reflexivityresearch.com/all-reports/eth-l2-debate-scaling-ethereum-or-parasitic)
- [CoinDesk: Fusaka](https://www.coindesk.com/tech/2025/12/03/fusaka-cementing-ethereum-s-role-as-on-chain-finance-settlement-layer-bitwise)
- [Blockworks: Ethereum Paradox](https://blockworks.co/news/ethereums-paradox-usage-at-all-time-highs-as-fees-plummet)

### Ecosystem Models

- [Gate: Cosmos](https://www.gate.com/learn/articles/who-killed-cosmos-the-interchain-king/11090)
- [VanEck: Solana Builders](https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-top-5-builders-driving-solanas-dominance/)
- [CoinGecko: Berachain](https://www.coingecko.com/learn/what-is-berachain-crypto-proof-of-liquidity)
- [MEXC: Avalanche](https://www.mexc.com/news/avalanche-avax-in-2025-speed-subnets-and-the-future-of-blockchain/116014)
- [Insights4VC: Hyperliquid](https://insights4vc.substack.com/p/hyperliquid-100-million-revenue-per)

### AI x Blockchain

- [Tao Media: Bittensor 2026](https://www.tao.media/the-ultimate-guide-to-bittensor-2026/)
- [Grayscale: Bittensor Halving](https://research.grayscale.com/reports/bittensor-on-the-eve-of-the-first-halving)
- [Ritual Foundation](https://www.ritualfoundation.org/docs/overview/what-is-ritual)
- [Gensyn Docs](https://docs.gensyn.ai/)
- [Morpheus](https://mor.org/)
- [Render Network](https://rendernetwork.com/)

### TEE + Blockchain

- [Flashbots: Sirrah TEE](https://writings.flashbots.net/suave-tee-coprocessor)
- [Oasis Network](https://oasis.net/)
- [Phala Network](https://phala.com/)
- [Secret Network](https://scrt.network/)

### Fee Distribution & Tokenomics

- [Uniswap: UNIfication](https://blog.uniswap.org/unification)
- [Solana Fees](https://solana.com/docs/core/fees)
- [Helium HNT](https://www.helium.com/hnt)
- [The Graph Tokenomics](https://thegraph.com/docs/en/resources/tokenomics/)
- [DefiLlama: Holders Revenue](https://defillama.com/holders-revenue)
