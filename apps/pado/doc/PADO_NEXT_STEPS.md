# Pado DEX 다음 단계 작업 계획서

> 작성일: 2025-12-26
> 현재 상태: Phase 6 완료 (NASUN 거래 지원)

---

## 현재 구현 상태

| Phase | 상태 | 내용 |
|-------|------|------|
| Phase 0 | ✅ 완료 | Nasun Devnet V3 리셋 |
| Phase 1 | ✅ 완료 | DeepBook V3 배포 + 테스트 토큰 |
| Phase 2 | ✅ 완료 | Frontend MVP (오더북, 주문폼, 잔고관리) |
| Phase 3 | ✅ 완료 | Trading UX 개선 (가격 클릭 연동, 주문 상태 피드백) |
| Phase 4 | ✅ 완료 | NASUN/NUSDC 거래 풀 생성 |
| Phase 5 | ✅ 완료 | 멀티 풀 지원 (MarketContext, MarketSelector) |
| Phase 6 | ✅ 완료 | NASUN 입금/출금 지원 (네이티브 토큰 가스비 예약) |

---

## 앞으로 해야 할 작업

### Phase 6: NASUN 거래 완성 ✅ 완료

**목표**: NASUN/NUSDC 풀에서 실제 거래가 가능하도록 완성

| 순서 | 작업 | 설명 | 상태 |
|------|------|------|--------|
| 6.1 | NASUN faucet | NASUN은 네이티브 토큰, gas faucet 사용 | ✅ 불필요 |
| 6.2 | Deposit 멀티풀 지원 | buildDepositAll/buildWithdrawAll Pool 파라미터 | ✅ 완료 |
| 6.3 | NASUN/NUSDC 거래 | 코드 구현 완료, 수동 테스트 필요 | ✅ 구현완료 |

**롤백 포인트**: `git tag v0.6.0-pre`

**구현 내용**:
- `buildWithdrawAll`: Pool 파라미터 추가, 현재 마켓 토큰 출금
- `buildDepositAll`: Pool 파라미터 추가, NASUN은 0.1 가스비 예약
- `DepositInfo` 타입: baseAmount/quoteAmount + 토큰 심볼 동적 지원
- Toast 메시지: 동적 토큰 심볼 표시

**테스트 체크리스트**:
- [x] NASUN은 네이티브 토큰 (gas faucet에서 받음)
- [x] NASUN 잔고 표시 정상 (기존 코드로 동작)
- [x] NASUN → BalanceManager 입금 (0.1 NASUN 가스비 예약)
- [ ] NASUN/NUSDC 매수 주문 (수동 테스트 필요)
- [ ] NASUN/NUSDC 매도 주문 (수동 테스트 필요)
- [ ] 주문 취소 정상 동작 (수동 테스트 필요)

---

### Phase 7: Trading UX 고급화 ⭐

**목표**: CEX 수준의 주문 옵션 제공

| 순서 | 작업 | 설명 | 난이도 |
|------|------|------|--------|
| 7.1 | 주문 유형 선택 UI | IOC, FOK, POST_ONLY 옵션 | 저 |
| 7.2 | 슬리피지 설정 UI | 시장가 주문 시 슬리피지 설정 | 저 |
| 7.3 | 가격 제안 버튼 | Mid Price, Best Bid/Ask, ±% 버튼 | 저 |

**롤백 포인트**: `git tag v0.7.0-pre`

**테스트 체크리스트**:
- [ ] IOC 주문 → 미체결 시 자동 취소 확인
- [ ] FOK 주문 → 전량 체결 불가 시 취소 확인
- [ ] POST_ONLY 주문 → Taker 시 거부 확인
- [ ] 슬리피지 설정 UI 표시/저장
- [ ] 가격 제안 버튼 클릭 시 주문 폼 자동 입력

---

### Phase 8: 대시보드 📊

**목표**: 사용자 자산/거래 현황 한눈에 파악

| 순서 | 작업 | 설명 | 난이도 |
|------|------|------|--------|
| 8.1 | 포트폴리오 대시보드 | 전체 자산 현황, 손익 계산 | 중 |
| 8.2 | 거래 통계 | 총 거래량, 평균 체결가 등 | 중 |
| 8.3 | 지갑 잔고 통합 표시 | 모든 토큰 잔고 한눈에 | 저 |

**롤백 포인트**: `git tag v0.8.0-pre`

**테스트 체크리스트**:
- [ ] 포트폴리오 페이지 로드 정상
- [ ] 자산 가치 계산 정확성
- [ ] 거래 통계 표시 정상
- [ ] 지갑 잔고 실시간 반영

---

### Phase 9: 모바일 & UX 개선 📱

| 순서 | 작업 | 설명 | 난이도 |
|------|------|------|--------|
| 9.1 | 모바일 반응형 최적화 | 현재 데스크톱 우선 → 모바일 대응 | 중 |
| 9.2 | 다크/라이트 테마 | 테마 전환 기능 | 저 |
| 9.3 | 레이아웃 커스터마이징 | 드래그앤드롭 배치 (선택) | 고 |

**롤백 포인트**: `git tag v0.9.0-pre`

---

### Phase 10+: 장기 로드맵 🔐

| 순서 | 작업 | 설명 | 난이도 |
|------|------|------|--------|
| 10.1 | zkLogin 통합 | Google/Apple 소셜 로그인 | 고 |
| 10.2 | Passkey 인증 | 생체 인증 지원 | 고 |
| 10.3 | Flash Loan 통합 | DeepBook V3 고유 기능 | 고 |
| 10.4 | Perps 준비 | 무기한 선물 거래 설계 | 고 |

---

## 작업 프로세스

### 각 Phase 시작 전

```bash
# 1. 롤백 포인트 확보
git add -A && git commit -m "chore: checkpoint before phase X"
git tag vX.Y.Z-pre

# 2. 작업 브랜치 생성 (선택)
git checkout -b feature/phase-X
```

### 각 Phase 완료 후

```bash
# 1. 빌드 테스트
cd frontend && pnpm run build

# 2. 개발 서버 테스트
pnpm run dev
# 수동으로 기능 테스트

# 3. 문서 업데이트
# - CLAUDE.md 개발 진행 상황 업데이트
# - 이 문서(PADO_NEXT_STEPS.md) 체크리스트 업데이트

# 4. 커밋 & 태그
git add -A && git commit -m "feat: complete phase X - 설명"
git tag vX.Y.Z

# 5. 푸시
git push origin main --tags
```

---

## 핵심 파일 목록

### Phase 6 수정 파일 ✅

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/features/trading/transactions.ts` | buildDepositAll/buildWithdrawAll Pool 파라미터 추가 |
| `frontend/src/features/trading/useTrading.ts` | depositAllTokens/withdrawAllTokens currentPool 전달 |
| `frontend/src/features/trading/types.ts` | DepositInfo 타입 동적 토큰 지원 |
| `frontend/src/features/trading/hooks/useOrderActions.ts` | Toast 메시지 동적 토큰 심볼 |

### Phase 7 수정 예상 파일

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/features/trading/components/OrderForm.tsx` | 주문 유형 드롭다운 |
| `frontend/src/features/trading/components/AdvancedOptions.tsx` | 슬리피지 설정 (신규) |
| `frontend/src/features/trading/components/PriceSuggestions.tsx` | 가격 제안 버튼 (신규) |

### Phase 8 수정 예상 파일

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/pages/PortfolioPage.tsx` | 포트폴리오 대시보드 (신규) |
| `frontend/src/features/analytics/` | 거래 통계 모듈 (신규) |
| `frontend/src/App.tsx` | 라우팅 추가 |

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-12-26 | 초안 작성 (Phase 6-10 계획) |
| 2025-12-26 | Phase 6 완료: NASUN 입금/출금 멀티풀 지원 |
