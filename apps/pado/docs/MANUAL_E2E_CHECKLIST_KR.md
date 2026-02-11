# Pado Spot Trading - 수동 E2E 테스트 체크리스트

> 최종 업데이트: 2026-02-10
> 총 테스트 케이스: ~65개 (10개 단계)

## 테스트 실행 순서

### 1단계: 지갑 & 초기 설정

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 1 | 새 지갑 생성 (니모닉) | 지갑 생성됨, 니모닉 백업 모달 표시 | |
| 2 | 지갑 잠금 및 잠금 해제 | 비밀번호 입력 프롬프트, 정상 잠금 해제 | |
| 3 | zkLogin 인증 (Google OAuth) | OAuth 플로우 완료, 지갑 연결됨 | |
| 4 | NASUN Faucet 요청 | 잔액 업데이트, 완료까지 로딩 스피너 표시 | |
| 5 | NBTC Faucet 요청 (1 NBTC) | 잔액 +1 NBTC 표시, 5초 쿨다운 활성화 | |
| 6 | NUSDC Faucet 요청 (100,000 NUSDC) | 잔액 +100,000 NUSDC 표시, 5초 쿨다운 활성화 | |
| 7 | 쿨다운 중 빠른 연속 클릭 | 버튼 비활성화, 중복 요청 없음 | |
| 8 | Pado 활성화 (BalanceManager 생성) | EnablePadoCard 표시, TX 후 BM 생성됨 | |
| 9 | Assets 탭에서 잔액 확인 | Wallet / Trading / In Orders 컬럼 정확함 | |
| 10 | NBTC를 BalanceManager에 입금 | Trading 잔액 증가, Wallet 잔액 감소 | |

### 2단계: Simple 모드 거래

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 11 | Simple 모드로 전환 | UI가 스왑 스타일 인터페이스로 변경 | |
| 12 | Quick Trade: NBTC $50 시장가 매수 | 주문 체결, 잔액 업데이트 | |
| 13 | Quick Trade: NBTC 전량 시장가 매도 | 주문 체결, NUSDC 잔액 증가 | |
| 14 | 슬리피지 1.0%로 변경 | 설정 유지, 주문 미리보기에 표시 | |
| 15 | 거래 후 잔액 업데이트 확인 | Wallet + Trading 잔액이 체결 반영 | |

### 3단계: Pro 모드 - 기본 주문

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 16 | Pro 모드로 전환 | 호가창, 차트, 주문 폼이 포함된 전체 레이아웃 | |
| 17 | GTC 지정가 매수 주문 (중간가 아래) | Open Orders 탭에 배지와 함께 주문 표시 | |
| 18 | Open Orders 탭에서 주문 취소 | 주문 제거, 잠금 자금 해제 | |
| 19 | POST_ONLY 지정가 매도 주문 | 스프레드를 넘어가면 (유동성 소비 시) 거부됨 | |
| 20 | IOC 시장가 매수 주문 | 가능한 유동성 체결, 잔여분 취소 | |
| 21 | FOK 주문 (큰 수량) | 전량 체결 불가 시 거부됨 | |
| 22 | 전체 주문 취소 (Cancel All) | 확인 후 모든 미체결 주문 취소 | |
| 23 | Order History 탭 확인 | 주문 생명주기 표시: 접수 -> 체결/취소 | |
| 24 | Trade History 탭 확인 | 체결 건당 1행, 가격/수량/시간 정확 | |
| 25 | One-Click Trading 활성화 | 위험 경고 모달, 이후 주문 시 확인 생략 | |

### 4단계: Pro 모드 - 고급 주문

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 26 | Stop-Limit 주문 | 트리거 가격 + 지정가 설정, TP/SL 탭에 표시 | |
| 27 | Trailing Stop 주문 (% 트레일) | 고점/저점 추적 활성화 | |
| 28 | Scale 주문 (5개, 균등 분배) | 미리보기에 가격 범위에 걸쳐 5개 주문 표시 | |
| 29 | Scale 주문 제출 | 5개 지정가 주문 순차 생성, 토스트에 결과 표시 | |
| 30 | 지정가 주문에 TP/SL 설정 | TP, SL 입력 필드 표시, 조건부 주문 생성 | |
| 31 | TP/SL 탭에서 활성 주문 확인 | 유형, 방향, 트리거 가격, 수량, 생성 시간 표시 | |
| 32 | TP/SL 주문 취소 | 활성 목록에서 제거 | |

### 5단계: 호가창 & 차트

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 33 | 호가창 가격 레벨 클릭 | 주문 폼에 가격 자동 입력 | |
| 34 | 매도 호가 레벨에 마우스 오버 | 스프레드 아래에 툴팁: VWAP, 총 수량, 비용, 영향도% | |
| 35 | 매수 호가 레벨에 마우스 오버 | 스프레드 위에 툴팁: VWAP, 총 수량, 비용, 영향도% | |
| 36 | Book/Trades 탭 전환 | 호가창과 최근 체결 뷰 전환 | |
| 37 | 깊이 레벨 변경 (5 -> 10 -> 20) | 행 수 변경 반영 | |
| 38 | 그룹핑 크기 변경 (0.01 -> 0.1 -> 1) | 가격 레벨 올바르게 집계 | |
| 39 | 스프레드 바 색상 확인 | 초록(<0.2%), 노랑(0.2-0.5%), 빨강(>0.5%) | |
| 40 | 대형 주문 벽 확인 | 평균 대비 3배 초과 주문에 두꺼운 바 표시 | |
| 41 | Depth Chart 탭 전환 | 시각적 깊이 차트 렌더링 | |
| 42 | 차트 인터벌 변경 (1m, 5m, 1h, 1d) | 각 인터벌에 맞는 OHLCV 데이터 로드 | |
| 43 | MA 지표 추가 | 이동평균선 차트에 표시 | |
| 44 | 차트에 수평선 그리기 | 인터벌 변경해도 선 유지 | |
| 45 | 피보나치 되돌림 그리기 | 레벨 선 표시 (23.6%, 38.2%, 50%, 61.8%) | |

### 6단계: 키보드 단축키 (Pro 모드)

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 46 | B 키 누르기 | 매수 방향 선택 | |
| 47 | S 키 누르기 | 매도 방향 선택 | |
| 48 | L 키 누르기 | 지정가 주문 모드 | |
| 49 | M 키 누르기 | 시장가 주문 모드 | |
| 50 | C 키 누르기 | Scale 주문 모드 | |
| 51 | 5 키 누르기 | 수량이 가용 잔액의 50%로 설정 | |
| 52 | +/= 키 누르기 | 가격 1틱 상승 | |
| 53 | - 키 누르기 | 가격 1틱 하락 | |
| 54 | Enter 키 누르기 | 주문 제출 (또는 확인 모달 표시) | |
| 55 | T 키 누르기 | Book/Trades 전환 | |
| 56 | ? 키 누르기 | 단축키 패널 열림 | |
| 57 | [ 와 ] 키 누르기 | 이전/다음 마켓 선택 | |

### 7단계: 모바일 반응형

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 58 | 모바일 너비로 리사이즈 (<1024px) | 단일 컬럼 레이아웃 (MobileTradeLayoutV2) | |
| 59 | 섹션 스크롤 | 차트 -> Quick Trade -> 호가창 -> 탭 순서 | |
| 60 | MobileChatDrawer 열기 | 우측에서 슬라이드인 패널 | |
| 61 | 모바일에서 시장가 주문 | 터치 친화적 버튼 정상 동작 | |
| 62 | MobileMiniTicker 확인 | 상단 고정 가격 바 + 24시간 변동률 | |

### 8단계: 포트폴리오 & 자산

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 63 | Assets 탭 내역 확인 | 토큰별 Wallet / Trading / In Orders / Total | |
| 64 | TransferModal로 입금 | Wallet -> BalanceManager 이체 | |
| 65 | TransferModal로 출금 | BalanceManager -> Wallet 이체 | |
| 66 | 잠금 금액 확인 | 미체결 주문이 가용 잔액 올바르게 차감 | |
| 67 | 주문 시 자동 입금 | BM 잔액 부족 시 Wallet에서 자동 이체 | |

### 9단계: 알림 & 경보

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 68 | 가격 알림 설정 (현재가 초과) | 알림 저장, 알림 목록에 표시 | |
| 69 | 가격 알림 트리거 대기 | 브라우저 알림 + 사운드 (활성화 시) | |
| 70 | 주문 체결 알림 확인 | 체결 시 토스트 + 브라우저 알림 | |
| 71 | 사운드 켜기/끄기 전환 | 체결 사운드가 설정 반영 | |

### 10단계: 에러 처리 & 엣지 케이스

| # | 테스트 케이스 | 예상 결과 | 통과 |
|---|--------------|----------|------|
| 72 | 잔액 부족 시 주문 | 빨간 에러 텍스트, 입금/Faucet 안내 | |
| 73 | 최소 수량 미만 주문 | 유효성 검사 에러 표시 | |
| 74 | 유효하지 않은 가격 입력 (틱 크기 미만) | 유효 틱으로 보정 또는 에러 | |
| 75 | 유효하지 않은 수량 입력 (랏 크기 미만) | 유효 랏으로 보정 또는 에러 | |
| 76 | 네트워크 연결 끊김 | OfflineBanner 표시, 호가창 경고 | |
| 77 | 네트워크 재연결 | 데이터 자동 새로고침 | |
| 78 | 가스 부족 시 주문 (NASUN 0) | Faucet NASUN 안내 에러 | |

---

## 관련 파일 참조

### 핵심 거래
- [TradePage.tsx](../frontend/src/pages/TradePage.tsx) - 메인 레이아웃
- [OrderForm.tsx](../frontend/src/features/trading/components/OrderForm.tsx) - Pro 주문 폼
- [SimpleOrderForm.tsx](../frontend/src/features/trading/components/SimpleOrderForm.tsx) - Simple 모드
- [ScaleOrderForm.tsx](../frontend/src/features/trading/components/ScaleOrderForm.tsx) - Scale 주문

### 호가창 & 데이터
- [Orderbook.tsx](../frontend/src/features/trading/components/Orderbook.tsx) - 호가창 UI
- [deepbook.ts](../frontend/src/lib/deepbook.ts) - DeepBook V3 연동
- [useOrderbook.ts](../frontend/src/features/trading/hooks/useOrderbook.ts) - 데이터 훅
- [useOrderActions.ts](../frontend/src/features/trading/hooks/useOrderActions.ts) - 주문 액션

### 차트
- [TradingViewChart.tsx](../frontend/src/features/trading/components/chart/TradingViewChart.tsx) - TradingView
- [DepthChart.tsx](../frontend/src/features/trading/components/chart/DepthChart.tsx) - 깊이 차트

### 키보드 & 모바일
- [useKeyboardShortcuts.ts](../frontend/src/features/trading/hooks/useKeyboardShortcuts.ts) - 단축키
- [MobileTradeLayoutV2.tsx](../frontend/src/features/trading/components/MobileTradeLayoutV2.tsx) - 모바일 레이아웃

### 포트폴리오 & 탭
- [BottomTabPanel.tsx](../frontend/src/features/trading/components/BottomTabPanel.tsx) - 탭 컨테이너
- [OpenOrders.tsx](../frontend/src/features/trading/components/OpenOrders.tsx) - 미체결 주문

### TP/SL & 알림
- [useTPSLMonitor.ts](../frontend/src/features/trading/hooks/useTPSLMonitor.ts) - TP/SL 모니터
- [usePriceAlertMonitor.ts](../frontend/src/features/trading/hooks/usePriceAlertMonitor.ts) - 가격 알림
