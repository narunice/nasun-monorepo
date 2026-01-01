# Pado UX 재구성 구현 계획서

> 작성일: 2026-01-01
> 목표: Pitch Deck 비전 "The Decentralized Everything Exchange"에 부합하는 UX 구현

---

## 1. 개요

### 1.1 현재 상태
- 기능 중심 네비게이션 (Trade, Perps, Lend, Predict, Stake, Portfolio)
- Dashboard 없음 - 바로 TradePage로 진입
- 기능 간 Silo 구조 (연결/통합 없음)
- Pro Trader 지향 UI

### 1.2 목표 상태
- 사용자 중심 네비게이션 (Home, Trade, Earn, Predict, Wallet)
- 통합 Dashboard로 시작
- Contextual Integration (기능 간 연결)
- Simple/Pro 모드 지원

### 1.3 구현 원칙
- **점진적 마이그레이션**: 기존 기능 유지하면서 개선
- **롤백 가능**: 각 단계별 git tag로 복원점 확보
- **테스트 우선**: 구현 전후 기능 검증
- **문서화**: 변경사항 즉시 문서 반영

---

## 2. 구현 Phase 목록

| Phase | 이름 | 설명 | 상태 |
|-------|------|------|------|
| UX-A | Navigation Restructure | 5-Tab 네비게이션 재구성 | ✅ 완료 |
| UX-B | Home Dashboard | 새 HomePage 구현 | ✅ 완료 |
| UX-C | Trade Page Enhancement | Simple/Pro 모드, Quick Actions | 📋 예정 |
| UX-D | Wallet Tab | Send/Receive 통합, 설정 | ✅ 기본 완료 |
| UX-E | Earn Tab (Future) | Lending + Staking 통합 (Phase 12-13 이후) | 📋 예정 |

---

## 3. Phase UX-A: Navigation Restructure

### 3.1 목표
Header.tsx의 네비게이션을 5-Tab 구조로 변경

### 3.2 Before → After

```
Before: Trade | Perps(disabled) | Lend(disabled) | Predict | Stake(disabled) | Portfolio | Send
After:  Home | Trade | Earn(disabled) | Predict | Wallet
```

### 3.3 파일 변경

| 파일 | 변경 내용 |
|------|----------|
| `Header.tsx` | 네비게이션 메뉴 재구성 |
| `AppRoutes.tsx` | 라우트 경로 조정 |

### 3.4 라우트 매핑

| 경로 | Before | After |
|------|--------|-------|
| `/` | TradePage | HomePage (신규) |
| `/trade` | TradePage | TradePage (유지) |
| `/portfolio` | PortfolioPage | 삭제 (Home으로 통합) |
| `/send` | PaymentPage | `/wallet` 하위로 이동 |
| `/wallet` | - | WalletPage (신규, Send/Receive 포함) |
| `/earn` | - | 비활성 (Phase 12-13 이후) |

### 3.5 체크리스트

- [ ] 롤백 포인트 생성: `git tag ux-restructure-pre`
- [ ] Header.tsx 네비게이션 변경
- [ ] AppRoutes.tsx 라우트 변경
- [ ] 기존 링크 동작 확인 (Portfolio → Home, Send → Wallet)
- [ ] 모바일 햄버거 메뉴 동작 확인
- [ ] 롤백 포인트 생성: `git tag ux-a-complete`
- [ ] 문서 업데이트

### 3.6 검증 항목

| 항목 | 검증 방법 |
|------|----------|
| Home 탭 활성화 | `/` 접근 시 Home 탭 하이라이트 |
| Trade 탭 동작 | `/trade` 접근 시 TradePage 렌더링 |
| Predict 탭 동작 | `/predict` 접근 시 PredictPage 렌더링 |
| Wallet 탭 동작 | `/wallet` 접근 시 WalletPage 렌더링 |
| Earn 탭 비활성 | 클릭 시 "Coming Soon" 표시 |
| 모바일 메뉴 | 768px 이하에서 햄버거 메뉴 동작 |

---

## 4. Phase UX-B: Home Dashboard

### 4.1 목표
통합 Dashboard 페이지 구현

### 4.2 컴포넌트 구조

```
HomePage
├── NetWorthCard          # 총 자산 표시
├── PortfolioHealthCard   # 마진 상태, 리스크 레벨
├── EarnOpportunityCard   # 수익 기회 제안
├── HotMarketsCard        # 인기 마켓 (가격 변동)
├── PredictionHighlight   # 주요 예측 시장
└── QuickActions          # 빠른 작업 버튼
```

### 4.3 파일 생성

| 파일 | 설명 |
|------|------|
| `pages/HomePage.tsx` | 메인 Dashboard 페이지 |
| `features/dashboard/` | Dashboard 관련 컴포넌트 모듈 |
| `features/dashboard/components/NetWorthCard.tsx` | 총 자산 카드 |
| `features/dashboard/components/PortfolioHealthCard.tsx` | 포트폴리오 건강 카드 |
| `features/dashboard/components/EarnOpportunityCard.tsx` | 수익 기회 카드 |
| `features/dashboard/components/HotMarketsCard.tsx` | 인기 마켓 카드 |
| `features/dashboard/components/PredictionHighlight.tsx` | 예측 시장 하이라이트 |
| `features/dashboard/components/QuickActions.tsx` | 빠른 작업 버튼 |
| `features/dashboard/hooks/useNetWorth.ts` | 총 자산 계산 hook |
| `features/dashboard/hooks/useHotMarkets.ts` | 인기 마켓 데이터 hook |

### 4.4 NetWorthCard 상세

```tsx
// 표시 항목
- Total Net Worth: $12,345.67 (↑ +$234, +1.9%)
- Breakdown:
  - Spot Balance: $8,000
  - Perp Margin: $2,000 (Phase 11 이후)
  - Earning: $2,000 (Phase 12-13 이후)
  - Prediction: $345
```

### 4.5 데이터 소스

| 데이터 | 소스 | 현재 구현 |
|--------|------|----------|
| Spot Balance | useMultiBalance | ✅ 있음 |
| Prediction Positions | usePredictionPositions | ✅ 있음 |
| Perp Margin | - | Phase 11 |
| Earning Balance | - | Phase 12-13 |
| 가격 정보 | - | 시뮬레이션 (실제 Oracle은 향후) |

### 4.6 체크리스트

- [ ] 롤백 포인트 확인: `ux-a-complete`
- [ ] features/dashboard/ 폴더 생성
- [ ] useNetWorth hook 구현
- [ ] NetWorthCard 컴포넌트 구현
- [ ] PortfolioHealthCard 컴포넌트 구현 (기본)
- [ ] HotMarketsCard 컴포넌트 구현
- [ ] PredictionHighlight 컴포넌트 구현
- [ ] QuickActions 컴포넌트 구현
- [ ] EarnOpportunityCard 컴포넌트 구현 (비활성)
- [ ] HomePage 통합
- [ ] 라이트/다크 테마 확인
- [ ] 모바일 반응형 확인
- [ ] 롤백 포인트 생성: `git tag ux-b-complete`
- [ ] 문서 업데이트

### 4.7 검증 항목

| 항목 | 검증 방법 |
|------|----------|
| Net Worth 표시 | 지갑 연결 시 총 자산 계산 |
| 가격 변동 표시 | 24h 변동률 표시 (시뮬레이션) |
| Hot Markets 클릭 | 해당 마켓 Trade 페이지로 이동 |
| Prediction 클릭 | 해당 마켓 상세 페이지로 이동 |
| Quick Actions | Trade, Send, Predict 버튼 동작 |
| 반응형 | 모바일에서 카드 스택 레이아웃 |

---

## 5. Phase UX-C: Trade Page Enhancement

### 5.1 목표
- Simple/Pro 모드 토글 추가
- Quick Amount 버튼 추가
- Prediction 연결 오버레이 (옵션)

### 5.2 Simple Mode vs Pro Mode

| 요소 | Simple | Pro |
|------|--------|-----|
| Chart | Line Chart | Candlestick + Indicators |
| Orderbook | 숨김 | 표시 |
| Order Type | Market Only | Limit, Market, GTC, IOC 등 |
| Amount Input | Quick Buttons ($50, $100, $500) | 직접 입력 |
| Trade History | 최근 5개 | 전체 |

### 5.3 파일 변경

| 파일 | 변경 내용 |
|------|----------|
| `TradePage.tsx` | Simple/Pro 모드 토글, 조건부 렌더링 |
| `features/trading/components/SimpleModeOrderForm.tsx` | 신규: 간소화된 주문 폼 |
| `features/trading/components/QuickAmountButtons.tsx` | 신규: 빠른 금액 버튼 |
| `features/trading/hooks/useTradeMode.ts` | 신규: 모드 상태 관리 |

### 5.4 체크리스트

- [ ] 롤백 포인트 확인: `ux-b-complete`
- [ ] useTradeMode hook 구현 (localStorage 저장)
- [ ] Simple/Pro 토글 UI 추가
- [ ] SimpleModeOrderForm 컴포넌트 구현
- [ ] QuickAmountButtons 컴포넌트 구현
- [ ] Pro Mode에서 기존 UI 유지 확인
- [ ] Simple Mode에서 간소화된 UI 확인
- [ ] 롤백 포인트 생성: `git tag ux-c-complete`
- [ ] 문서 업데이트

### 5.5 검증 항목

| 항목 | 검증 방법 |
|------|----------|
| 모드 전환 | 토글 클릭 시 UI 변경 |
| 모드 저장 | 새로고침 후 모드 유지 |
| Simple Buy | Quick Amount 선택 후 Buy 동작 |
| Pro Mode | 기존 모든 기능 동작 |

---

## 6. Phase UX-D: Wallet Tab

### 6.1 목표
Send/Receive 기능을 Wallet 탭으로 통합

### 6.2 WalletPage 구조

```
WalletPage
├── TabNavigation (Send | Receive | History | Settings)
├── SendTab (기존 PaymentPage 내용)
├── ReceiveTab (QR Code, 주소 복사)
├── HistoryTab (트랜잭션 내역)
└── SettingsTab (보안 설정)
```

### 6.3 파일 변경

| 파일 | 변경 내용 |
|------|----------|
| `pages/WalletPage.tsx` | 신규: 통합 지갑 페이지 |
| `pages/PaymentPage.tsx` | 삭제 또는 리다이렉트 |
| `features/wallet/` | 신규: 지갑 관련 컴포넌트 |

### 6.4 체크리스트

- [ ] 롤백 포인트 확인: `ux-c-complete`
- [ ] WalletPage 생성
- [ ] 기존 PaymentPage 내용 이전
- [ ] Receive 탭 추가 (QR + 주소)
- [ ] History 탭 추가
- [ ] Settings 탭 추가 (보안 설정)
- [ ] /send 경로 → /wallet 리다이렉트
- [ ] 롤백 포인트 생성: `git tag ux-d-complete`
- [ ] 문서 업데이트

---

## 7. 롤백 전략

### 7.1 Git Tag 목록

| Tag | 시점 | 설명 |
|-----|------|------|
| `ux-restructure-pre` | 작업 시작 전 | 완전 복원점 |
| `ux-a-complete` | Phase UX-A 완료 | Navigation 변경 완료 |
| `ux-b-complete` | Phase UX-B 완료 | Home Dashboard 완료 |
| `ux-c-complete` | Phase UX-C 완료 | Trade 개선 완료 |
| `ux-d-complete` | Phase UX-D 완료 | Wallet Tab 완료 |

### 7.2 롤백 명령어

```bash
# 특정 단계로 롤백
git checkout ux-a-complete

# 완전 롤백 (작업 시작 전)
git checkout ux-restructure-pre

# 롤백 후 새 브랜치로 작업
git checkout -b fix/ux-issue ux-b-complete
```

---

## 8. 테스트 체크리스트

### 8.1 기능 테스트

| 기능 | 테스트 항목 |
|------|------------|
| 네비게이션 | 모든 탭 클릭 → 올바른 페이지 이동 |
| Home Dashboard | 자산 표시, 카드 클릭 동작 |
| Trade | 주문 생성, 체결, 취소 |
| Predict | 마켓 조회, 주문, 포지션 관리 |
| Wallet | Send, Receive, History 조회 |

### 8.2 UI 테스트

| 항목 | 테스트 방법 |
|------|------------|
| 다크 모드 | 모든 페이지 다크 테마 적용 확인 |
| 라이트 모드 | 모든 페이지 라이트 테마 적용 확인 |
| 모바일 (375px) | 햄버거 메뉴, 카드 스택 레이아웃 |
| 태블릿 (768px) | 중간 레이아웃 확인 |
| 데스크톱 (1280px) | 전체 레이아웃 확인 |

### 8.3 브라우저 테스트

- [ ] Chrome (최신)
- [ ] Firefox (최신)
- [ ] Safari (최신)

---

## 9. 문서 업데이트 계획

### 9.1 Phase별 문서 업데이트

| Phase | 업데이트 대상 |
|-------|--------------|
| UX-A | CLAUDE.md (Project Structure), PADO_UI_ROADMAP.md |
| UX-B | PADO_UI_ROADMAP.md (컴포넌트 추가) |
| UX-C | PADO_UI_ROADMAP.md (Simple/Pro 모드) |
| UX-D | PADO_UI_ROADMAP.md, PADO_NEXT_STEPS.md |

### 9.2 최종 문서화

- [ ] CLAUDE.md - 프로젝트 구조 업데이트
- [ ] PADO_IMPLEMENTATION_PLAN.md - UX Phase 추가
- [ ] PADO_UI_ROADMAP.md - 컴포넌트 목록 업데이트
- [ ] PADO_NEXT_STEPS.md - 완료 항목 표시
- [ ] 이 문서 (PADO_UX_RESTRUCTURE_PLAN.md) - 완료 표시

---

## 10. 구현 순서

```
1. 롤백 포인트 생성 (ux-restructure-pre)
   ↓
2. Phase UX-A: Navigation
   - Header.tsx 수정
   - AppRoutes.tsx 수정
   - 테스트 → 태그 (ux-a-complete)
   ↓
3. Phase UX-B: Home Dashboard
   - features/dashboard/ 생성
   - HomePage.tsx 구현
   - 테스트 → 태그 (ux-b-complete)
   ↓
4. Phase UX-C: Trade Enhancement
   - Simple/Pro 모드
   - QuickAmountButtons
   - 테스트 → 태그 (ux-c-complete)
   ↓
5. Phase UX-D: Wallet Tab
   - WalletPage 생성
   - 기존 PaymentPage 이전
   - 테스트 → 태그 (ux-d-complete)
   ↓
6. 최종 문서화 및 정리
```

---

## 11. 예상 이슈 및 대응

| 이슈 | 대응 방안 |
|------|----------|
| Portfolio 페이지 제거 시 기존 링크 깨짐 | Home으로 리다이렉트 처리 |
| useNetWorth 가격 데이터 없음 | 시뮬레이션 가격 사용, TODO 표시 |
| Simple Mode에서 고급 기능 접근 | Pro Mode 전환 유도 UI |
| 모바일에서 Dashboard 복잡함 | 카드 접기/펴기 기능 |

---

## 12. 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2026-01-01 | 초안 작성 |
| 2026-01-01 | Phase UX-A 완료: 5-Tab 네비게이션 (ux-a-complete) |
| 2026-01-01 | Phase UX-B 완료: Home Dashboard 모듈 (ux-b-complete) |
