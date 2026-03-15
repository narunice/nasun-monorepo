# Nasun Link Manual E2E Test Scenarios

## Prerequisites

- Staging: https://staging.nasun.io
- Nasun devnet faucet에서 테스트용 NSN 확보 (최소 50 NSN)
- Browser A: 보내는 사람 (지갑 연결됨)
- Browser B: 받는 사람 (시크릿모드 또는 다른 브라우저, 미연결 상태)

---

## TC-1: NSN 링크 생성 및 Claim (Happy Path)

**목적**: 새 코드로 생성한 NSN 링크가 정상적으로 claim되는지 확인

**Steps**:
1. Browser A에서 지갑 연결
2. Wallet dropdown > Nasun Link > Create Link
3. Token: NSN, Amount: 5 선택
4. Conditions: None (기본값)
5. Create Link 클릭, 트랜잭션 서명
6. 생성된 URL 복사
7. Browser B에서 해당 URL 접속

**Expected**:
- Claim 페이지에 "You received a gift! 5 NSN" 표시
- "No valid gas coins" 에러 **없음**
- "This link has no funds" 메시지 **없음**

8. Browser B에서 Google 로그인 또는 지갑 연결
9. "Claim 5 NSN" 버튼 클릭

**Expected**:
- "Claiming..." 로딩 표시 후 "Claimed Successfully!" 화면
- Transaction digest 표시
- 받는 사람 지갑에 정확히 **5 NSN** 수령 확인 (5.05나 4.95가 아닌 정확히 5)

---

## TC-2: 소액 NSN 링크 (0.1 NSN)

**목적**: 소액 전송 시 gas reserve보다 적은 금액도 정상 동작하는지 확인

**Steps**:
1. Browser A에서 링크 생성: NSN 0.1
2. Browser B에서 claim

**Expected**:
- 정확히 0.1 NSN 수령
- 에러 없이 claim 성공

---

## TC-3: 대액 NSN 링크 (100 NSN)

**목적**: 큰 금액에서도 정확한 금액 전달 확인

**Steps**:
1. Browser A에서 링크 생성: NSN 100
2. Browser B에서 claim

**Expected**:
- 정확히 100 NSN 수령
- sender 지갑에서 100.05 NSN 차감 확인 (100 + gas budget)

---

## TC-4: 메시지 포함 링크

**목적**: 메시지가 정상 표시되고 claim에 영향 없는지 확인

**Steps**:
1. Browser A에서 링크 생성: NSN 1, Message: "Welcome to Nasun!"
2. Browser B에서 claim 페이지 접속

**Expected**:
- "Welcome to Nasun!" 메시지 표시
- claim 정상 동작

---

## TC-5: 만료 시간 포함 링크

**목적**: 만료 전/후 claim 동작 확인

**Steps (만료 전)**:
1. Browser A에서 링크 생성: NSN 1, Expiration: 24 hours
2. Browser B에서 즉시 claim

**Expected**:
- "Expires: ..." 날짜 표시
- claim 정상 동작

**Steps (만료 후)**:
3. 만료 시간이 지난 링크 URL 접속 (이전에 만료된 링크가 있다면)

**Expected**:
- "Link Expired" 메시지 표시
- Claim 버튼 없음

---

## TC-6: 비밀번호 보호 링크

**목적**: 비밀번호 입력 없이 claim 불가, 올바른 비밀번호로 claim 가능

**Steps**:
1. Browser A에서 링크 생성: NSN 2, Password: "test1234"
2. Browser B에서 claim 페이지 접속, 지갑 연결

**Expected (비밀번호 미입력)**:
- Password 입력 필드 표시
- "Claim" 버튼 비활성화 (비밀번호 미입력 시)

3. 잘못된 비밀번호 "wrong" 입력 후 Claim 클릭

**Expected**:
- "Invalid password" 에러 메시지

4. 올바른 비밀번호 "test1234" 입력 후 Claim 클릭

**Expected**:
- Claim 성공, 2 NSN 수령

---

## TC-7: 이미 Claim된 링크 재접속

**목적**: 이미 claim된 링크 접속 시 적절한 안내

**Steps**:
1. TC-1에서 claim 완료된 링크 URL을 다시 접속

**Expected**:
- "Already Claimed" 또는 "This link has no funds" 메시지 표시
- Claim 버튼 없음 또는 비활성화

---

## TC-8: 미연결 상태에서 Claim 페이지 접속

**목적**: 지갑 미연결 사용자 UX 확인

**Steps**:
1. 시크릿모드 브라우저에서 유효한 claim URL 접속

**Expected**:
- "You received a gift! X NSN" 표시
- "Sign in to claim your tokens" 안내
- Google 로그인 버튼 표시
- Claim 버튼은 표시되지 않음 (로그인 필요)

---

## TC-9: zkLogin으로 Claim

**목적**: Google zkLogin 사용자의 claim 플로우 확인

**Steps**:
1. 시크릿모드에서 claim URL 접속
2. Google 로그인 버튼 클릭
3. Google OAuth 완료 후 redirect

**Expected**:
- OAuth 후 claim 페이지로 복귀
- 금액/메시지 정상 표시
- "Claim X NSN" 버튼 활성화
4. Claim 클릭

**Expected**:
- Claim 성공

---

## TC-10: Sender 잔액 확인

**목적**: Sender가 amount + gas budget을 지불하는지 확인

**Steps**:
1. Browser A에서 sender 잔액 기록 (예: 50.00 NSN)
2. 10 NSN 링크 생성
3. 링크 생성 후 sender 잔액 확인

**Expected**:
- 잔액이 약 39.95 NSN (= 50 - 10 - 0.05 gas budget - tx fee)
- sender가 10 NSN이 아닌 ~10.05 NSN을 소비

---

## TC-11: 잔액 부족으로 링크 생성 실패

**목적**: sender 잔액이 amount + gas budget보다 부족할 때 에러 처리

**Steps**:
1. 잔액이 0.1 NSN인 지갑으로 0.1 NSN 링크 생성 시도

**Expected**:
- 트랜잭션 실패 에러 (0.1 + 0.05 gas = 0.15 NSN 필요하지만 0.1만 보유)
- 또는 잔액 부족 안내 메시지

---

## TC-12: NUSDC (Non-native Token) 링크

**목적**: 비 네이티브 토큰 링크가 기존과 동일하게 동작하는지 확인 (regression)

**Steps**:
1. Browser A에서 NUSDC 보유 확인
2. NUSDC 10 링크 생성
3. Browser B에서 claim

**Expected**:
- Claim 페이지에 "10 NUSDC" 표시
- Claim 성공, 정확히 10 NUSDC 수령
- (Non-native는 기존 코드 경로 - 변경 없음)

---

## TC-13: 잘못된 링크 URL

**목적**: 변조/손상된 URL에 대한 에러 처리

**Steps**:
1. 유효한 claim URL의 일부를 변경하여 접속 (예: 마지막 문자 변경)

**Expected**:
- "Invalid Link" 또는 HMAC 검증 실패 메시지
- 앱이 crash하지 않음

2. secret (# 뒤 부분) 없이 접속

**Expected**:
- "Missing claim secret" 에러 메시지

---

## TC-14: 같은 링크 동시 Claim 시도

**목적**: 두 명이 동시에 같은 링크를 claim 시도할 때 한 명만 성공

**Steps**:
1. Single type 링크 생성
2. Browser B와 Browser C에서 동시에 claim 시도

**Expected**:
- 한 명만 성공, 다른 한 명은 "Link has no funds" 에러
- 이중 지급 없음

---

## TC-15: Claim 버튼 더블클릭 방지

**목적**: Claim 버튼을 빠르게 연속 클릭해도 한 번만 실행

**Steps**:
1. 유효한 claim 페이지에서 지갑 연결
2. "Claim X NSN" 버튼을 빠르게 2-3번 연속 클릭

**Expected**:
- 첫 클릭 후 즉시 "Claiming..." 로딩 상태로 전환
- 버튼 비활성화 (disabled)
- 트랜잭션 1번만 실행
- 정상 claim 성공

---

## Checklist Summary

| TC | 시나리오 | Priority | Pass/Fail |
|----|---------|----------|-----------|
| 1 | NSN Happy Path (5 NSN) | P0 | |
| 2 | 소액 (0.1 NSN) | P0 | |
| 3 | 대액 (100 NSN) | P1 | |
| 4 | 메시지 포함 | P2 | |
| 5 | 만료 시간 | P1 | |
| 6 | 비밀번호 보호 | P1 | |
| 7 | 이미 Claim된 링크 | P1 | |
| 8 | 미연결 상태 접속 | P1 | |
| 9 | zkLogin Claim | P0 | |
| 10 | Sender 잔액 차감 확인 | P0 | |
| 11 | 잔액 부족 에러 | P1 | |
| 12 | NUSDC 링크 (regression) | P0 | |
| 13 | 잘못된 URL | P2 | |
| 14 | 동시 Claim | P1 | |
| 15 | 더블클릭 방지 | P2 | |
