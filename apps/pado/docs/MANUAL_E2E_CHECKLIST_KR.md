# Pado Spot Trading - 수동 E2E 테스트 체크리스트

> 최종 업데이트: 2026-02-23
> 총 테스트 케이스: ~198개 (27개 단계)

## 테스트 실행 순서

### 1단계: 지갑 & 초기 설정

| #   | 테스트 케이스                     | 예상 결과                                   | 통과 |
| --- | --------------------------------- | ------------------------------------------- | ---- |
| 1   | 새 지갑 생성 (니모닉)             | 지갑 생성됨, 니모닉 백업 모달 표시          |      |
| 2   | 지갑 잠금 및 잠금 해제            | 비밀번호 입력 프롬프트, 정상 잠금 해제      |      |
| 3   | zkLogin 인증 (Google OAuth)       | OAuth 플로우 완료, 지갑 연결됨              |      |
| 4   | NASUN Faucet 요청                 | 잔액 업데이트, 완료까지 로딩 스피너 표시    |      |
| 5   | NBTC Faucet 요청 (1 NBTC)         | 잔액 +1 NBTC 표시, 5초 쿨다운 활성화        |      |
| 6   | NUSDC Faucet 요청 (100,000 NUSDC) | 잔액 +100,000 NUSDC 표시, 5초 쿨다운 활성화 |      |
| 7   | 쿨다운 중 빠른 연속 클릭          | 버튼 비활성화, 중복 요청 없음               |      |
| 8   | Pado 활성화 (BalanceManager 생성) | EnablePadoCard 표시, TX 후 BM 생성됨        |      |
| 9   | Assets 탭에서 잔액 확인           | Wallet / Trading / In Orders 컬럼 정확함    |      |
| 10  | NBTC를 BalanceManager에 입금      | Trading 잔액 증가, Wallet 잔액 감소         |      |

### 2단계: Simple 모드 거래

| #   | 테스트 케이스                      | 예상 결과                          | 통과 |
| --- | ---------------------------------- | ---------------------------------- | ---- |
| 11  | Simple 모드로 전환                 | UI가 스왑 스타일 인터페이스로 변경 |      |
| 12  | Quick Trade: NBTC $50 시장가 매수  | 주문 체결, 잔액 업데이트           |      |
| 13  | Quick Trade: NBTC 전량 시장가 매도 | 주문 체결, NUSDC 잔액 증가         |      |
| 14  | 슬리피지 1.0%로 변경               | 설정 유지, 주문 미리보기에 표시    |      |
| 15  | 거래 후 잔액 업데이트 확인         | Wallet + Trading 잔액이 체결 반영  |      |

### 3단계: Pro 모드 - 기본 주문

| #   | 테스트 케이스                      | 예상 결과                                    | 통과 |
| --- | ---------------------------------- | -------------------------------------------- | ---- |
| 16  | Pro 모드로 전환                    | 호가창, 차트, 주문 폼이 포함된 전체 레이아웃 |      |
| 17  | GTC 지정가 매수 주문 (중간가 아래) | Open Orders 탭에 배지와 함께 주문 표시       |      |
| 18  | Open Orders 탭에서 주문 취소       | 주문 제거, 잠금 자금 해제                    |      |
| 19  | POST_ONLY 지정가 매도 주문         | 스프레드를 넘어가면 (유동성 소비 시) 거부됨  |      |
| 20  | IOC 시장가 매수 주문               | 가능한 유동성 체결, 잔여분 취소              |      |
| 21  | FOK 주문 (큰 수량)                 | 전량 체결 불가 시 거부됨                     |      |
| 22  | 전체 주문 취소 (Cancel All)        | 확인 후 모든 미체결 주문 취소                |      |
| 23  | Order History 탭 확인              | 주문 생명주기 표시: 접수 -> 체결/취소        |      |
| 24  | Trade History 탭 확인              | 체결 건당 1행, 가격/수량/시간 정확           |      |
| 25  | One-Click Trading 활성화           | 위험 경고 모달, 이후 주문 시 확인 생략       |      |

### 4단계: Pro 모드 - 고급 주문

| #   | 테스트 케이스                 | 예상 결과                                     | 통과 |
| --- | ----------------------------- | --------------------------------------------- | ---- |
| 26  | Stop-Limit 주문               | 트리거 가격 + 지정가 설정, TP/SL 탭에 표시    |      |
| 27  | Trailing Stop 주문 (% 트레일) | 고점/저점 추적 활성화                         |      |
| 28  | Scale 주문 (5개, 균등 분배)   | 미리보기에 가격 범위에 걸쳐 5개 주문 표시     |      |
| 29  | Scale 주문 제출               | 5개 지정가 주문 순차 생성, 토스트에 결과 표시 |      |
| 30  | 지정가 주문에 TP/SL 설정      | TP, SL 입력 필드 표시, 조건부 주문 생성       |      |
| 31  | TP/SL 탭에서 활성 주문 확인   | 유형, 방향, 트리거 가격, 수량, 생성 시간 표시 |      |
| 32  | TP/SL 주문 취소               | 활성 목록에서 제거                            |      |

### 5단계: 호가창 & 차트

| #   | 테스트 케이스                       | 예상 결과                                          | 통과 |
| --- | ----------------------------------- | -------------------------------------------------- | ---- |
| 33  | 호가창 가격 레벨 클릭               | 주문 폼에 가격 자동 입력                           |      |
| 34  | 매도 호가 레벨에 마우스 오버        | 스프레드 아래에 툴팁: VWAP, 총 수량, 비용, 영향도% |      |
| 35  | 매수 호가 레벨에 마우스 오버        | 스프레드 위에 툴팁: VWAP, 총 수량, 비용, 영향도%   |      |
| 36  | Book/Trades 탭 전환                 | 호가창과 최근 체결 뷰 전환                         |      |
| 37  | 깊이 레벨 변경 (5 -> 10 -> 20)      | 행 수 변경 반영                                    |      |
| 38  | 그룹핑 크기 변경 (0.01 -> 0.1 -> 1) | 가격 레벨 올바르게 집계                            |      |
| 39  | 스프레드 바 색상 확인               | 초록(<0.2%), 노랑(0.2-0.5%), 빨강(>0.5%)           |      |
| 40  | 대형 주문 벽 확인                   | 평균 대비 3배 초과 주문에 두꺼운 바 표시           |      |
| 41  | Depth Chart 탭 전환                 | 시각적 깊이 차트 렌더링                            |      |
| 42  | 차트 인터벌 변경 (1m, 5m, 1h, 1d)   | 각 인터벌에 맞는 OHLCV 데이터 로드                 |      |
| 43  | MA 지표 추가                        | 이동평균선 차트에 표시                             |      |
| 44  | 차트에 수평선 그리기                | 인터벌 변경해도 선 유지                            |      |
| 45  | 피보나치 되돌림 그리기              | 레벨 선 표시 (23.6%, 38.2%, 50%, 61.8%)            |      |

### 6단계: 키보드 단축키 (Pro 모드)

| #   | 테스트 케이스    | 예상 결과                       | 통과 |
| --- | ---------------- | ------------------------------- | ---- |
| 46  | B 키 누르기      | 매수 방향 선택                  |      |
| 47  | S 키 누르기      | 매도 방향 선택                  |      |
| 48  | L 키 누르기      | 지정가 주문 모드                |      |
| 49  | M 키 누르기      | 시장가 주문 모드                |      |
| 50  | C 키 누르기      | Scale 주문 모드                 |      |
| 51  | 5 키 누르기      | 수량이 가용 잔액의 50%로 설정   |      |
| 52  | +/= 키 누르기    | 가격 1틱 상승                   |      |
| 53  | - 키 누르기      | 가격 1틱 하락                   |      |
| 54  | Enter 키 누르기  | 주문 제출 (또는 확인 모달 표시) |      |
| 55  | T 키 누르기      | Book/Trades 전환                |      |
| 56  | ? 키 누르기      | 단축키 패널 열림                |      |
| 57  | [ 와 ] 키 누르기 | 이전/다음 마켓 선택             |      |

### 7단계: 모바일 반응형

| #   | 테스트 케이스                    | 예상 결과                                | 통과 |
| --- | -------------------------------- | ---------------------------------------- | ---- |
| 58  | 모바일 너비로 리사이즈 (<1024px) | 단일 컬럼 레이아웃 (MobileTradeLayoutV2) |      |
| 59  | 섹션 스크롤                      | 차트 -> Quick Trade -> 호가창 -> 탭 순서 |      |
| 60  | MobileChatDrawer 열기            | 우측에서 슬라이드인 패널                 |      |
| 61  | 모바일에서 시장가 주문           | 터치 친화적 버튼 정상 동작               |      |
| 62  | MobileMiniTicker 확인            | 상단 고정 가격 바 + 24시간 변동률        |      |

### 8단계: 포트폴리오 & 자산

| #   | 테스트 케이스        | 예상 결과                                   | 통과 |
| --- | -------------------- | ------------------------------------------- | ---- |
| 63  | Assets 탭 내역 확인  | 토큰별 Wallet / Trading / In Orders / Total |      |
| 64  | TransferModal로 입금 | Wallet -> BalanceManager 이체               |      |
| 65  | TransferModal로 출금 | BalanceManager -> Wallet 이체               |      |
| 66  | 잠금 금액 확인       | 미체결 주문이 가용 잔액 올바르게 차감       |      |
| 67  | 주문 시 자동 입금    | BM 잔액 부족 시 Wallet에서 자동 이체        |      |

### 9단계: 알림 & 경보

| #   | 테스트 케이스                | 예상 결과                          | 통과 |
| --- | ---------------------------- | ---------------------------------- | ---- |
| 68  | 가격 알림 설정 (현재가 초과) | 알림 저장, 알림 목록에 표시        |      |
| 69  | 가격 알림 트리거 대기        | 브라우저 알림 + 사운드 (활성화 시) |      |
| 70  | 주문 체결 알림 확인          | 체결 시 토스트 + 브라우저 알림     |      |
| 71  | 사운드 켜기/끄기 전환        | 체결 사운드가 설정 반영            |      |

### 10단계: 에러 처리 & 엣지 케이스

| #   | 테스트 케이스                          | 예상 결과                          | 통과 |
| --- | -------------------------------------- | ---------------------------------- | ---- |
| 72  | 잔액 부족 시 주문                      | 빨간 에러 텍스트, 입금/Faucet 안내 |      |
| 73  | 최소 수량 미만 주문                    | 유효성 검사 에러 표시              |      |
| 74  | 유효하지 않은 가격 입력 (틱 크기 미만) | 유효 틱으로 보정 또는 에러         |      |
| 75  | 유효하지 않은 수량 입력 (랏 크기 미만) | 유효 랏으로 보정 또는 에러         |      |
| 76  | 네트워크 연결 끊김                     | OfflineBanner 표시, 호가창 경고    |      |
| 77  | 네트워크 재연결                        | 데이터 자동 새로고침               |      |
| 78  | 가스 부족 시 주문 (NASUN 0)            | Faucet NASUN 안내 에러             |      |

---

## Phase 22 테스트: 테스트넷 런칭 폴리시 (T1 + T2)

> 추가: 2026-02-15. Phase 22에서 구현된 기능들의 테스트.
> 온체인 트랜잭션, 시각 효과, 캔버스 렌더링, 실제 CSS 레이아웃, WebSocket 연결,
> 서드파티 연동 등 jsdom/vitest로 시뮬레이션할 수 없는 항목들.

### 11단계: Getting Started & 온보딩 (T1)

| #   | 테스트 케이스                           | 예상 결과                                                      | 통과 |
| --- | --------------------------------------- | -------------------------------------------------------------- | ---- |
| 79  | 신규 사용자로 HomePage 방문 (지갑 없음) | GettingStartedCard 표시: 3단계 (지갑 생성, 토큰 받기, 첫 거래) |      |
| 80  | 1단계: GettingStartedCard에서 지갑 생성 | 1단계 완료 체크, 2단계 하이라이트                              |      |
| 81  | 2단계: "토큰 받기" 클릭                 | Faucet 플로우 실행, 성공 후 2단계 완료 체크                    |      |
| 82  | 3단계: 첫 거래 완료                     | 3단계 완료 체크, "준비 완료!" 상태 표시                        |      |
| 83  | 모든 단계 완료 후 HomePage 재방문       | GettingStartedCard 숨김 또는 완료 상태 (차단하지 않음)         |      |
| 84  | localStorage 초기화 후 재방문           | GettingStartedCard 재표시, 모든 단계 미완료                    |      |

### 12단계: 첫 거래 축하 (T1)

| #   | 테스트 케이스                                | 예상 결과                                                      | 통과 |
| --- | -------------------------------------------- | -------------------------------------------------------------- | ---- |
| 85  | 첫 거래 실행 (신규 지갑, 거래 이력 0)        | 컨페티 애니메이션 재생, 축하 모달 표시                         |      |
| 86  | 축하 모달 내용                               | "실제 L1 CLOB에서 거래했습니다!" 메시지, 거래 상세(페어, 금액) |      |
| 87  | 축하 모달 Twitter 공유 버튼                  | 거래 상세가 포함된 Twitter 공유 인텐트 열림                    |      |
| 88  | 축하 모달 닫기                               | 모달 닫힘, 다음 거래 시 재표시 안 됨                           |      |
| 89  | 두 번째 거래 실행                            | 컨페티 없음, 축하 모달 없음 (1회성)                            |      |
| 90  | 세션 간 테스트: 거래 후 브라우저 닫고 재실행 | localStorage에 축하 상태 유지, 재트리거 없음                   |      |

### 13단계: 온보딩 투어 & 채팅 노출 (T1)

| #   | 테스트 케이스                               | 예상 결과                                           | 통과 |
| --- | ------------------------------------------- | --------------------------------------------------- | ---- |
| 91  | Simple 모드에서 TradePage 첫 방문           | 온보딩 투어 자동 시작, 단계별 툴팁 표시             |      |
| 92  | Simple 모드 요소 투어 대상                  | 툴팁이 가리키는 곳: 스왑 폼, 마켓 선택기, 잔액 표시 |      |
| 93  | 투어 완료                                   | 투어 상태 저장, 다음 방문 시 재트리거 안 됨         |      |
| 94  | 투어 중간 종료                              | 투어 중단, 자동 재시작 안 됨                        |      |
| 95  | 첫 방문 시 MobileChatDrawer (모바일 뷰포트) | 채팅 드로어 잠시 자동 열림 또는 알림 도트 표시      |      |
| 96  | 채팅 접기 후 새 메시지 수신                 | 채팅 토글 버튼에 알림 도트 표시                     |      |
| 97  | 알림 후 채팅 다시 열기                      | 도트 사라짐, 새 메시지 표시                         |      |

### 14단계: 토큰별 동적 에러 메시지 (T1)

| #   | 테스트 케이스                                | 예상 결과                                      | 통과 |
| --- | -------------------------------------------- | ---------------------------------------------- | ---- |
| 98  | NETH/NUSDC 마켓에서 NETH 부족 시 주문 시도   | "Not enough NETH" 에러 ("NBTC" 아님)           |      |
| 99  | NSOL/NUSDC 마켓에서 NSOL 부족 시 주문 시도   | "Not enough NSOL" 에러                         |      |
| 100 | NASUN/NUSDC 마켓에서 NASUN 부족 시 주문 시도 | "Not enough NASUN" 에러                        |      |
| 101 | NETH 마켓 자동 입금 플로우                   | 자동 입금 메시지가 NETH 참조, 정확한 금액 입금 |      |
| 102 | NETH 마켓 Faucet 버튼                        | "Get NETH" 표시 ("NBTC" 아님)                  |      |

### 15단계: 무기한 선물 거래 & Earn 페이지

| #   | 테스트 케이스                           | 예상 결과                                                          | 통과 |
| --- | --------------------------------------- | ------------------------------------------------------------------ | ---- |
| 103 | /markets/perp 페이지 이동              | PerpTradePage 로드: 레버리지 슬라이더, 호가창, 포지션 패널 표시    |      |
| 104 | BTC 롱 포지션 열기 (5x 레버리지)       | 포지션 목록에 진입가, 레버리지와 함께 포지션 표시                  |      |
| 105 | 레버리지 슬라이더 조정 (1x ~ 20x)      | 레버리지 업데이트, 마진 요구량 재계산                              |      |
| 106 | 펀딩률 표시 확인                        | 현재 펀딩률과 다음 펀딩 시간 표시                                  |      |
| 107 | 무기한 선물 포지션 청산                 | 포지션 목록에서 제거, 실현 PnL 표시                                |      |
| 108 | Earn 페이지 이동                        | Staking 탭 숨겨짐 또는 "Coming Soon" 배너, 깨진 스텁 없음          |      |
| 109 | Earn 페이지 미완성 폼 없음              | 미구현 스테이킹 기능의 입력 필드나 버튼 없음                       |      |

### 16단계: 모바일 차트 & 호가창 개선 (T2)

| #   | 테스트 케이스                             | 예상 결과                                                 | 통과 |
| --- | ----------------------------------------- | --------------------------------------------------------- | ---- |
| 107 | 모바일 리사이즈 (<1024px), 차트 높이 확인 | 차트 컨테이너 높이 약 min(40vh, 350px), 고정 250px가 아님 |      |
| 108 | 375px 너비(iPhone SE)에서 차트 사용성     | 차트 오버플로우 없음, 캔들 표시, 터치 줌 작동             |      |
| 109 | 430px 너비(iPhone 14 Pro Max)에서 차트    | 더 큰 뷰포트 활용, iPhone SE보다 높은 차트                |      |
| 110 | MiniOrderbook 8레벨 표시                  | 매도(빨강) 8행 + 매수(초록) 8행 확인                      |      |
| 111 | 모바일 MiniOrderbook 가격 클릭            | 가격 레벨 탭 시 주문 폼 가격 필드 채움                    |      |
| 112 | MiniOrderbook 스프레드 표시               | 매도/매수 사이 스프레드 행 (퍼센트 포함) 표시             |      |
| 113 | 스크롤 동작: 차트 -> 호가창 -> 거래 폼    | 부드러운 스크롤, 콘텐츠 겹침이나 z-index 문제 없음        |      |

### 17단계: 공유 카드 강화 (T2)

| #   | 테스트 케이스               | 예상 결과                                                        | 통과 |
| --- | --------------------------- | ---------------------------------------------------------------- | ---- |
| 114 | 거래 후 PnL 공유 모달 열기  | ShareCardModal에 거래 성과 데이터 표시                           |      |
| 115 | 캔버스 카드 렌더링          | 카드 포함: PnL 데이터, "Built by 2 people" 워터마크, Pado 브랜딩 |      |
| 116 | 카드에 포인트/랭크 표시     | 사용자 포인트가 있으면 공유 카드에 표시                          |      |
| 117 | 공유 카드 다운로드          | "Download" 버튼으로 PNG 파일 저장                                |      |
| 118 | Twitter 공유 버튼           | 이미지 첨부 또는 인텐트 URL로 Twitter 열림, 해시태그 포함        |      |
| 119 | 모바일 뷰포트에서 공유 카드 | 카드 정상 렌더링, 터치 친화적 버튼                               |      |
| 120 | 마이너스 PnL 공유 카드      | 빨간색 계열, 정확한 음수 퍼센트 표시                             |      |
| 121 | 거래 없는 상태의 공유 카드  | 빈 상태 표시 또는 공유 버튼 비활성화                             |      |

### 18단계: 로딩 스켈레톤 (T2)

| #   | 테스트 케이스                          | 예상 결과                                                   | 통과 |
| --- | -------------------------------------- | ----------------------------------------------------------- | ---- |
| 122 | Dashboard 페이지 초기 로드 (캐시 삭제) | NetWorthCard, HotMarketsCard 데이터 로드 중 스켈레톤 표시   |      |
| 123 | Portfolio 페이지 초기 로드             | AssetOverview, TokenBalanceList, RecentTrades 스켈레톤 표시 |      |
| 124 | Leaderboard 페이지 초기 로드           | 리더보드 테이블에 스켈레톤 행 표시                          |      |
| 125 | DevTools에서 네트워크 Slow 3G로 스로틀 | 스켈레톤 장시간 표시, 실제 콘텐츠로 부드러운 전환           |      |
| 126 | 빈 콘텐츠 플래시 없음                  | 콘텐츠 영역에 즉시 스켈레톤 표시, 빈 흰 공간 절대 없음      |      |

### 19단계: 사용자 친화적 에러 메시지 (T2)

| #   | 테스트 케이스                         | 예상 결과                                                             | 통과 |
| --- | ------------------------------------- | --------------------------------------------------------------------- | ---- |
| 127 | "InsufficientBalance" RPC 에러 유발   | 토스트: 사용자 친화적 메시지 + "입금 또는 Faucet 사용" 안내           |      |
| 128 | "GasPaymentError" 유발 (NASUN 가스 0) | 토스트: "가스 수수료용 NASUN 필요" + "Faucet에서 NASUN 받기" 버튼     |      |
| 129 | 네트워크 타임아웃/RPC 접속 불가 유발  | 토스트: "네트워크 연결 문제" + "몇 초 후 재시도" 안내                 |      |
| 130 | "ObjectNotFound" 에러 유발            | 토스트: 오브젝트 삭제/미존재 설명, 새로고침 제안                      |      |
| 131 | 에러 메시지에 액션 버튼 포함 확인     | 최소 1개 에러 유형에 클릭 가능 CTA (예: "Faucet 이동")                |      |
| 132 | 에러 메시지에 raw hex/RPC 데이터 없음 | 사용자 대상 토스트에 `0x...` 주소, Move 중단 코드, 스택 트레이스 없음 |      |

### 20단계: 포인트 시스템 & 리더보드 (T2)

> **전제 조건**: 포인트 집계 활성화된 Chat-server 실행 필요.

| #   | 테스트 케이스                            | 예상 결과                                             | 통과 |
| --- | ---------------------------------------- | ----------------------------------------------------- | ---- |
| 133 | /leaderboard 이동, "포인트" 탭/모드 찾기 | 볼륨 탭 옆에 포인트 리더보드 탭 표시                  |      |
| 134 | 포인트 리더보드에 순위 표시              | 순위, 주소/닉네임, 총 포인트, 세부 항목 컬럼 테이블   |      |
| 135 | 거래 실행 후 집계 사이클 대기            | 포인트 리더보드에 트레이더 표시 (또는 포인트 증가)    |      |
| 136 | 여러 풀(NBTC + NETH)에서 거래            | 다양성 포인트 증가 (고유 풀 수 \* 25pt)               |      |
| 137 | 첫 거래 보너스                           | 신규 지갑 첫 거래 시 100 보너스 포인트 부여           |      |
| 138 | 볼륨 기반 포인트                         | $1K 이상 볼륨 시 $1K당 5포인트 (대량 거래 후 확인)    |      |
| 139 | 포인트 리더보드 정렬                     | 총 포인트 내림차순 정렬, 순위 번호 연속               |      |
| 140 | 모바일 뷰포트에서 포인트 탭              | 테이블 가로 스크롤 또는 좁은 너비 적응                |      |
| 141 | prev_rank 추적 확인                      | 여러 집계 사이클 후 순위 변동 반영 (상승/하락 화살표) |      |

---

## TP/SL Keeper 모달 & 뱃지 테스트

> 추가: 2026-02-15. TP/SL 실행 모드 안내문 개선 및 addOrderAsync 버그 수정 후 검증.
> TradeCap 위임, keeper 헬스체크, 서버/브라우저 모드 전환, 토스트 메시지 등
> 온체인 트랜잭션과 실시간 keeper 상태에 의존하므로 자동화 불가.
>
> **전제 조건**: keeper bot이 실행 중인 환경 (staging 또는 production)에서 테스트.

### 21단계: TPSLKeeperModal (첫 사용 안내 팝업)

| #   | 테스트 케이스                           | 예상 결과                                                                | 통과 |
| --- | --------------------------------------- | ------------------------------------------------------------------------ | ---- |
| 142 | 첫 TP/SL 주문 생성 시 모달 표시         | TPSLKeeperModal 팝업 표시 (이전에 "Don't show again" 체크하지 않은 경우) |      |
| 143 | 모달 제목 확인                          | "TP/SL Execution Mode" 표시 ("TP/SL Order Protection" 아님)              |      |
| 144 | Browser Mode 카드 텍스트                | "~5s polling" 문구 포함, "Orders stop if you close the tab" 표시         |      |
| 145 | Server Mode 카드 텍스트                 | "~10s polling" 문구 포함, "Pado keeper" 명시 ("keeper service" 아님)      |      |
| 146 | Scope 항목 확인                         | "all pools" 강조, "Your funds remain in your custody", "Revocable anytime" |      |
| 147 | Limitations 항목 확인                   | "Stop-Limit and Trailing Stop orders always run in your browser" 명시    |      |
| 148 | "Use Browser Mode" 버튼 클릭           | 모달 닫힘, TradeCap 위임 없음, 주문이 client-side로 등록됨              |      |
| 149 | "Enable Server Mode" 버튼 클릭         | TradeCap 위임 TX 실행, 성공 시 모달 닫힘                                |      |
| 150 | Enable Server Mode 성공 토스트          | "TradeCap delegated. TP and SL orders will execute server-side." 표시    |      |
| 151 | Enable Server Mode 실패 (TX 거부)       | 에러 토스트 표시, 모달 열린 상태 유지                                    |      |
| 152 | "Don't show again" 체크 후 닫기         | 같은 지갑으로 다음 TP/SL 생성 시 모달 미표시                            |      |
| 153 | 다른 지갑으로 전환 후 TP/SL 생성        | 새 지갑에는 모달 다시 표시 (지갑별 독립 상태)                            |      |

### 22단계: TPSLKeeperBadge (실행 모드 뱃지)

| #   | 테스트 케이스                                  | 예상 결과                                                            | 통과 |
| --- | ---------------------------------------------- | -------------------------------------------------------------------- | ---- |
| 154 | 뱃지 초기 표시 (미위임 상태)                   | "Browser" 텍스트 + 회색 도트 표시                                    |      |
| 155 | 뱃지 초기 표시 (위임 상태, keeper 정상)         | "Server" 텍스트 + 초록 도트 표시                                     |      |
| 156 | 뱃지 초기 표시 (위임 상태, keeper 다운)         | "Server (Offline)" 텍스트 + 노랑 도트 표시                           |      |
| 157 | 뱃지 클릭 → 패널 펼침 (미위임)                 | "Browser Only" 라벨, 토글 off 상태                                   |      |
| 158 | 패널 Browser Only 설명 텍스트                  | "All TP/SL orders execute in your browser (~5s interval)" 표시       |      |
| 159 | 패널 Browser Only 설명 하단                    | "Enable server mode to keep TP and SL active while offline" 표시     |      |
| 160 | 뱃지 클릭 → 패널 펼침 (위임)                   | "Server-Side" 라벨, 토글 on 상태                                     |      |
| 161 | 패널 Server-Side 설명 텍스트                   | "TP and SL orders execute on the Pado keeper (~10s interval)" 표시   |      |
| 162 | 패널 Server-Side 설명 하단                     | "Stop-Limit and Trailing Stop remain browser-only" 표시              |      |
| 163 | 패널에서 토글 on (delegate)                    | TradeCap 위임 TX 실행, 성공 토스트 표시                              |      |
| 164 | Delegate 성공 토스트                           | "TradeCap delegated. TP and SL orders will execute server-side."     |      |
| 165 | 패널에서 토글 off (revoke)                     | TradeCap 해제 TX 실행, 성공 토스트 표시                              |      |
| 166 | Revoke 성공 토스트                             | "TradeCap revoked. All TP/SL orders now require browser tab open."   |      |
| 167 | 위임 상태에서 TradeCap ID 표시                 | 패널 하단에 "TradeCap: 0x1234abcd..." 형태로 truncated ID 표시       |      |
| 168 | Keeper offline 경고                            | 위임 + keeper 다운 시 노란 경고: "Keeper service is unreachable..." 표시 |      |
| 169 | 패널 외부 클릭                                 | 펼쳐진 패널 닫힘                                                     |      |

### 23단계: 서버 모드 주문 생성 & 토스트 (addOrderAsync)

> **전제 조건**: TradeCap이 위임된 상태 (Server 모드 활성화).

| #   | 테스트 케이스                                 | 예상 결과                                                          | 통과 |
| --- | --------------------------------------------- | ------------------------------------------------------------------ | ---- |
| 170 | Server 모드 — TP 주문 생성                    | 토스트: "Take Profit set at $XX,XXX (server-side)" 표시            |      |
| 171 | Server 모드 — SL 주문 생성                    | 토스트: "Stop Loss set at $XX,XXX (server-side)" 표시              |      |
| 172 | Server 모드 — Stop-Limit 주문 생성            | 토스트: "Stop-Limit set at $XX,XXX → limit $YY,YYY (browser-only)" |      |
| 173 | Server 모드 — Trailing Stop 주문 생성 (%)     | 토스트: "Trailing Stop set at $XX,XXX (trail X%) (browser-only)"   |      |
| 174 | Server 모드 — Trailing Stop 주문 생성 ($)     | 토스트: "Trailing Stop set at $XX,XXX (trail $Y,YYY) (browser-only)" |      |
| 175 | Browser 모드 — TP 주문 생성                   | 토스트에 모드 태그 없음: "Take Profit set at $XX,XXX"              |      |
| 176 | Browser 모드 — Stop-Limit 주문 생성           | 토스트에 "(browser-only)" 태그 없음                                |      |
| 177 | Server 모드 — TP 생성 후 keeper API 확인      | TP/SL 탭에 주문 표시, keeper에 등록됨 (서버 목록에 반영)           |      |
| 178 | Server 모드 — 탭 닫고 keeper 실행 대기        | keeper가 트리거 조건 충족 시 주문 실행 (브라우저 없이도 작동)      |      |
| 179 | Server 모드 — SL 취소                         | 토스트: "TP/SL order cancelled (server)", keeper 목록에서 제거     |      |

### 24단계: 지정가 주문 연동 TP/SL (서버 모드)

> **전제 조건**: TradeCap이 위임된 상태 (Server 모드 활성화).

| #   | 테스트 케이스                                      | 예상 결과                                                          | 통과 |
| --- | -------------------------------------------------- | ------------------------------------------------------------------ | ---- |
| 180 | 지정가 매수 + TP 설정 → 체결 대기                  | 지정가 체결 후 TP가 자동 생성, keeper에 등록 (server-side 토스트)   |      |
| 181 | 지정가 매수 + SL 설정 → 체결 대기                  | 지정가 체결 후 SL이 자동 생성, keeper에 등록 (server-side 토스트)   |      |
| 182 | 지정가 매수 + TP + SL 동시 설정 → 체결 대기        | 지정가 체결 후 TP, SL 모두 자동 생성                               |      |
| 183 | 시장가 매수 + TP + SL → One-Click Trading           | 즉시 체결 + TP/SL 동시 생성, 서버 등록 확인                        |      |

### 25단계: Passkey 지갑

| #   | 테스트 케이스                              | 예상 결과                                      | 통과 |
| --- | ------------------------------------------ | ---------------------------------------------- | ---- |
| 184 | Passkey 기반 지갑 생성                     | Passkey 등록됨, 디바이스 크레덴셜로 지갑 생성  |      |
| 185 | Passkey 인증 (생체인식/PIN)                | Passkey 검증 성공, 지갑 잠금 해제              |      |
| 186 | Passkey 서명으로 거래 실행                 | Passkey로 트랜잭션 서명, 거래 완료             |      |
| 187 | 세션 간 Passkey 유지                       | 브라우저 닫고 재열기, Passkey 여전히 사용 가능 |      |

### 26단계: 대회 (Competitions)

| #   | 테스트 케이스                              | 예상 결과                                      | 통과 |
| --- | ------------------------------------------ | ---------------------------------------------- | ---- |
| 188 | /competitions 페이지 이동                  | 대회 목록 페이지 로드                          |      |
| 189 | 활성 대회 카운트다운 확인                  | 남은 시간 타이머, 참가자 수 표시               |      |
| 190 | 대회 리더보드 로드                         | 순위별 참가자 볼륨/PnL 표시                    |      |
| 191 | /competitions/:id 페이지 이동              | 대회 상세 페이지: 규칙 + 리더보드              |      |

### 27단계: PWA 기능

| #   | 테스트 케이스                              | 예상 결과                                      | 통과 |
| --- | ------------------------------------------ | ---------------------------------------------- | ---- |
| 192 | 브라우저에서 PWA 설치                      | "앱 설치" 프롬프트 표시, 홈 화면에 설치        |      |
| 193 | 홈 화면에서 실행                           | 독립 모드로 열림 (브라우저 크롬 없음)          |      |
| 194 | 서비스 워커 에셋 캐싱                      | 첫 로드 후 정적 에셋 캐시에서 제공             |      |
| 195 | 연결 끊김 시 오프라인 배너                 | 네트워크 끊김 시 OfflineBanner 표시            |      |

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

### TP/SL & Keeper & 알림

- [useTPSLMonitor.ts](../frontend/src/features/trading/hooks/useTPSLMonitor.ts) - TP/SL 모니터 (client + server 모드)
- [useTradeCap.ts](../frontend/src/features/trading/hooks/useTradeCap.ts) - TradeCap 위임/해제 훅
- [TPSLKeeperBadge.tsx](../frontend/src/features/trading/components/TPSLKeeperBadge.tsx) - 실행 모드 뱃지 + 토글
- [TPSLKeeperModal.tsx](../frontend/src/features/trading/components/TPSLKeeperModal.tsx) - 첫 사용 안내 모달
- [TradingPanel.tsx](../frontend/src/features/trading/containers/TradingPanel.tsx) - 주문 생성 (addOrderAsync 연동)
- [tpsl-api.ts](../frontend/src/features/trading/lib/tpsl-api.ts) - Keeper REST API 클라이언트
- [tpsl-types.ts](../frontend/src/features/trading/lib/tpsl-types.ts) - TP/SL 타입 정의
- [tpsl-storage.ts](../frontend/src/features/trading/lib/tpsl-storage.ts) - localStorage 기반 주문 저장
- [usePriceAlertMonitor.ts](../frontend/src/features/trading/hooks/usePriceAlertMonitor.ts) - 가격 알림

### Phase 22 (T1/T2) 컴포넌트

- [GettingStartedCard.tsx](../frontend/src/features/dashboard/components/GettingStartedCard.tsx) - 온보딩 체크리스트
- [FirstTradeCelebration.tsx](../frontend/src/features/trading/components/FirstTradeCelebration.tsx) - 컨페티 + 모달
- [useFirstTradeCelebration.ts](../frontend/src/features/trading/hooks/useFirstTradeCelebration.ts) - 첫 거래 감지
- [MiniOrderbook.tsx](../frontend/src/features/trading/components/MiniOrderbook.tsx) - 모바일 호가창 (8레벨)
- [MobileTradeLayoutV2.tsx](../frontend/src/features/trading/components/MobileTradeLayoutV2.tsx) - 모바일 레이아웃
- [ShareCardModal.tsx](../frontend/src/features/social/components/ShareCardModal.tsx) - 공유 카드 UI
- [canvasRenderer.ts](../frontend/src/features/social/utils/canvasRenderer.ts) - 캔버스 카드 렌더러
- [errorParser.ts](../frontend/src/features/trading/utils/errorParser.ts) - RPC 에러 매퍼
- [Skeleton.tsx](../frontend/src/components/common/Skeleton.tsx) - 로딩 스켈레톤 컴포넌트
- [PointsLeaderboardTable.tsx](../frontend/src/features/leaderboard/components/PointsLeaderboardTable.tsx) - 포인트 탭
- [PerpsComingSoonPage.tsx](../frontend/src/pages/PerpsComingSoonPage.tsx) - Perps 정보 페이지
