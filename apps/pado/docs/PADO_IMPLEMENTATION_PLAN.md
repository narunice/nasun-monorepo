# Pado 구현 계획서 (Implementation Plan)

**작성일**: 2025-12-25
**최종 업데이트**: 2026-01-17
**상태**: Phase 16 v1, 11.1-11.4, 17 완료

---

## 📅 Phase별 구현 계획

### Phase 0: Infrastructure (✅ 완료)
- [x] Nasun Devnet V3 리셋 (Sui v1.63.0 fork)
- [x] 2-Node Validator 합의 구성
- [x] Fullnode RPC + Faucet 구축

### Phase 1: Spot DEX Core (✅ 완료)
- [x] DeepBook V3 패키지 배포
- [x] Test Tokens (NBTC, NUSDC) 배포
- [x] NBTC/NUSDC 풀 생성

### Phase 2: Trading UI MVP (✅ 완료)
- [x] Orderbook 컴포넌트
- [x] OrderForm (Limit/Market)
- [x] UserBalance 관리

### Phase 3: Trading UX (✅ 완료)
- [x] Chart (Lightweight Charts)
- [x] Order History
- [x] Real-time Updates

### Phase 4: Multi-Pool (✅ 완료)
- [x] NASUN/NUSDC 풀 추가
- [x] Market Selector UI

### Phase 5: Native Token (✅ 완료)
- [x] NASUN 입금/출금
- [x] 가스비 예약 로직

### Phase 6: Trading UX Pro (✅ 완료)
- [x] 차트 보조지표 (MA, RSI, MACD)
- [x] Volume 차트

### Phase 7: Portfolio Dashboard (✅ 완료)
- [x] 자산 현황 요약
- [x] P&L 차트

### Phase 8: Mobile & Theme (✅ 완료)
- [x] 모바일 반응형 디자인
- [x] 다크/라이트 테마

### Phase 9: Smart Account v2 (✅ 완료)
- [x] zkLogin 통합 (Google)
- [x] Salt 관리 Lambda

### Phase 14: Prediction Markets (✅ 완료)
- [x] Prediction 컨트랙트 배포
- [x] 마켓 생성/거래/정산 UI
- [x] 시드 유동성 공급

### Phase 15: Payments (✅ 완료)
- [x] 토큰 전송 UI
- [x] QR 코드 결제

### Phase 16: Unified Margin v1 (✅ 완료)
- [x] **MarginAccount 컨트랙트** (Multi-collateral)
- [x] **Risk Engine v1** (4-Tier Threshold)
- [x] **Liquidation Engine** (5% 보너스)
- [x] **Smart Account UI** (통합 잔고 표시)

### Phase 17: Lottery (✅ 완료)
- [x] **Lottery v2 컨트랙트** (Sui Random)
- [x] **티켓 구매 UI**
- [x] **라운드 관리 및 추첨**

### Phase 11: Perpetuals DEX (✅ 11.4 완료)
- [x] **11.1 Core**: PerpMarket, Position, Leverage (20x)
- [x] **11.2 Funding**: 8시간 펀딩, Oracle 연동
- [x] **11.3 UI**: Perp Trading 페이지, 주문 UI
- [x] **11.4 Liquidation**: 청산 엔진, Keeper
- [ ] **11.5 Integration**: Spot-Perp 통합 마진 (Unified Margin v2)

---

## 다음 단계 (Next Steps)

> 상세 계획은 **[PADO_NEXT_STEPS.md](PADO_NEXT_STEPS.md)**를 참조하세요.

1. **Phase 11.5**: Spot-Perp Integration (Unified Margin v2)
2. **Phase 12**: Lending & Borrowing
3. **Phase 13**: Staking

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-01-17 | Phase 16 v1, 11.1-11.4, 17 완료 상태 업데이트 |
| 2026-01-10 | Phase 16 v1, 11.1-11.2 완료 상태 업데이트 |
| 2026-01-09 | Phase 17 완료 상태 업데이트 |
| 2026-01-04 | Phase 9, 14, 15 완료 상태 업데이트 |
| 2025-12-25 | 최초 작성 |