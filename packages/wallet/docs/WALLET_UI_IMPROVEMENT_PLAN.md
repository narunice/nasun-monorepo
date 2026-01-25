# Nasun Wallet UI Improvement Plan

**Version**: 2.1
**Date**: 2026-01-25
**Status**: In Progress (Phase 1 Completed)
**Reference**: 2026 Blockchain Wallet Market Analysis Report

---

## Executive Summary

2026년 블록체인 월렛 시장 분석과 ChatGPT UI 제안을 종합 검토한 결과, 나선 월렛은 **기술적으로 시장 선도 수준**(zkLogin, Smart Account, Guardian Recovery)이나 **UX가 이를 충분히 표현하지 못하는 상태**임.

본 문서는 시장 트렌드(시드리스 복구, Web3 방화벽, 모바일 퍼스트, 한국 사용자 특화)를 반영한 실용적 개선 계획을 제시함.

---

## 1. 시장 분석 기반 나선 월렛 포지셔닝

### 1.1 2026년 월렛 시장 핵심 트렌드

| 트렌드 | 설명 | 대표 월렛 |
|--------|------|-----------|
| **시드리스/MPC 복구** | 12/24단어 시드 대신 소셜 로그인, 생체 인증, 클라우드 백업 | Zengo, Coinbase, Best Wallet |
| **Web3 방화벽** | 트랜잭션 시뮬레이션, 위험 탐지, 피싱 방지 | Zengo ClearSign |
| **체인 추상화** | 네트워크·가스비·브릿지 복잡성 제거 | MetaMask Snaps, Trust Wallet |
| **모바일 퍼스트** | 72% 모바일 사용, 앱 기반 UX | Trust Wallet, Zengo |
| **복구 경험 강화** | "실수에 관대한" 복구 모델 | Tangem 멀티카드, Cypherock 분산 |

### 1.2 나선 월렛의 경쟁 우위

| 기능 | 나선 월렛 | 경쟁 월렛 비교 |
|------|-----------|----------------|
| **zkLogin (소셜 로그인)** | ✅ Google OAuth | Zengo 3FA, Coinbase 소셜 로그인 |
| **Smart Account** | ✅ 멀티시그, 가중치 | Safe (Gnosis) 수준 |
| **Guardian Recovery** | ✅ 사회적 복구 | Zengo MPC, Argent 가디언 |
| **Clear Signing** | ✅ 트랜잭션 프리뷰 | Zengo ClearSign |
| **Gasless Tx** | ✅ Sponsored | Coinbase Gasless |

**핵심 인사이트**: 나선 월렛은 기술적으로 Zengo + Safe 수준이나, UX가 이를 충분히 전달하지 못함.

### 1.3 현재 UX 문제점 (시장 기준)

| 문제 | 시장 기대 | 나선 월렛 현재 |
|------|-----------|----------------|
| **온보딩** | 3분 이내 완료 | zkLogin 빠름, 로컬 지갑은 복잡 |
| **복구 포지셔닝** | "실수해도 복구 가능" 강조 | Trinity Progress가 "보안"처럼 보임 |
| **트랜잭션 확인** | 위험 시 명확한 경고 | Clear Signing 있으나 노출 부족 |
| **고객 지원** | 인앱 헬프센터, FAQ | 지원 채널 없음 |
| **한국어 지원** | 네이티브 한글 | 영어 전용 |

---

## 2. 현재 상태 분석

### 2.1 WalletConnect.tsx 구조

| 항목 | 현재 값 |
|------|---------|
| 총 라인 수 | 2,075 lines |
| ViewMode 수 | 23개 |
| TabMode | 3개 (tokens, nfts, history) |
| 렌더링 패턴 | Sequential if statements |
| 네비게이션 | State-based (viewMode 상태) |
| 드롭다운 섹션 | 8-9개 |
| 하위 컴포넌트 | 20+ |

### 2.2 ViewMode 분류

**화면 (Screens)** - 독립적 뷰:
- `main`, `nfts`, `staking`, `portfolio`, `settings`, `address-book`
- `nsa-info`, `receive`

**플로우 (Flows)** - 단계적 작업:
- `create`, `create-backup`, `import`, `export`, `send`
- `nsa-setup`, `nsa-add-signer`, `nsa-accept-proposal`
- `nsa-backup`, `nsa-guardians`, `nsa-recovery`
- `ledger-connect`, `ledger-select`
- `nasun-link`

**상태 (States)** - 조건부 UI:
- `unlock` (잠금 해제 대기)

---

## 3. ChatGPT 제안 비판적 검토

### 3.1 4탭 구조 (Home/Activity/Explore/Settings)

**제안**: 최상위 4개 고정 탭으로 재구성

**비판**:
- 현재 지갑은 드롭다운 패널 형태 (약 320-400px 너비)
- 하단 네비게이션 바는 풀스크린 모바일 앱에 적합, 작은 패널에서는 공간 낭비
- 현재 3탭 (tokens/nfts/history)이 이미 효과적으로 작동 중

**결론**: ❌ 채택하지 않음

**대안**: 현재 탭 구조 유지, 드롭다운 메뉴 항목만 재그룹화

---

### 3.2 초보 모드 / 고급 모드 분기

**제안**: 초보 모드(기본) + 고급 모드(opt-in) 도입

**비판**:
- 이미 `isAdvancedMode` 토글이 존재
- "초보 모드"라는 라벨 자체가 사용자에게 부정적 인상

**결론**: ⚠️ 부분 채택

**대안**: 점진적 공개(progressive disclosure) 패턴 적용

---

### 3.3 Smart Account = 보안 레벨 재포지셔닝

**제안**: Smart Account를 "보안 레벨"로 표현

**비판**:
- Smart Account는 "보안 레벨"이 아니라 "계정 타입(Account Type)"
- Multi-signer, Guardian은 "보안"보다 **"복구(Recovery)"** 기능에 가까움
- 시장 트렌드: "실수에 관대한 복구"가 핵심 메시지

**결론**: ❌ "보안 레벨" 표현은 거부

**수정된 대안**: **"Recovery Readiness"** 프레이밍
- Zengo의 성공 요인: "Never lose access to your crypto"
- 나선 월렛 메시지: "실수해도 복구할 수 있습니다"

---

## 4. 채택할 개선 사항 (시장 트렌드 반영)

### 4.1 복구 경험 재설계 (핵심)

**시장 인사이트**: 65%의 사용자가 복구 불안으로 월렛 이탈

**현재 문제**:
- "Trinity Progress"가 "보안 체크리스트"처럼 보임
- 복구 가능성이 아닌 "설정 완료 여부"에 초점

**개선안**:

```
┌─────────────────────────────────────┐
│ 🛡 RECOVERY READY                   │
│                                     │
│ Your wallet can be recovered if:    │
│ ✅ You lose your device             │
│ ✅ You forget your password         │
│ ✅ Your account is compromised      │
│                                     │
│ Protection: 2/3 methods active      │
│ ████████░░░░ 67%                    │
│                                     │
│ [Complete Setup →]                  │
└─────────────────────────────────────┘
```

**리네이밍**:
| 현재 | 개선 |
|------|------|
| Trinity Progress | Recovery Readiness |
| Multipath | Alternative Access |
| Backup | Offline Backup |
| Guardian | Social Recovery |

---

### 4.2 트랜잭션 안전성 강화 (Web3 방화벽)

**시장 인사이트**: Zengo ClearSign이 "해킹 0건"의 핵심 요인

**현재 상태**: Clear Signing 컴포넌트 존재하나 노출 부족

**개선안**:

**모든 트랜잭션에 Safety Score 표시**:
```
┌─────────────────────────────────────┐
│ TRANSACTION PREVIEW                 │
├─────────────────────────────────────┤
│ 🟢 Safety Score: HIGH               │
│                                     │
│ Action: Send 100 NASUN              │
│ To: 0x1234...5678                   │
│ Gas: ~0.001 NASUN                   │
│                                     │
│ ✅ Known address (your history)     │
│ ✅ Standard transfer                │
│ ✅ Gas estimate normal              │
├─────────────────────────────────────┤
│ [Cancel]              [Confirm →]   │
└─────────────────────────────────────┘
```

**위험 거래 시**:
```
┌─────────────────────────────────────┐
│ ⚠️ REVIEW REQUIRED                  │
├─────────────────────────────────────┤
│ 🟡 Safety Score: MEDIUM             │
│                                     │
│ ⚠️ New address (first interaction)  │
│ ⚠️ Large amount (>$1,000)           │
│ ✅ Gas estimate normal              │
│                                     │
│ Are you sure you want to proceed?   │
├─────────────────────────────────────┤
│ [Cancel]        [I understand →]    │
└─────────────────────────────────────┘
```

---

### 4.3 온보딩 플로우 최적화

**시장 인사이트**: 78%가 3분 이내 온보딩 완료를 기대

**현재 상태**:
- zkLogin: 빠름 (Google 로그인 1-click)
- 로컬 지갑: 복잡함 (비밀번호 설정 + 백업 권유)

**개선안 - 선택지 단순화**:

```
┌─────────────────────────────────────┐
│         Welcome to Nasun           │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🚀 Quick Start (Recommended)    │ │
│ │                                 │ │
│ │ Sign in with Google             │ │
│ │ No seed phrase needed           │ │
│ │ Recovery via email              │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🔐 Traditional Wallet           │ │
│ │                                 │ │
│ │ Create with password            │ │
│ │ 12-word seed phrase             │ │
│ │ Full self-custody               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ───────── or ─────────              │
│                                     │
│ [Import Existing Wallet]            │
└─────────────────────────────────────┘
```

**핵심 변경**:
- zkLogin을 "Quick Start (Recommended)"로 최상단 배치
- "No seed phrase needed" 강조
- 로컬 지갑은 "Traditional" 또는 "Advanced"로 포지셔닝

---

### 4.4 드롭다운 메뉴 재구조화

**현재 문제**: 11개 버튼이 나열되어 있어 계층 없음

**개선안**:

```
┌─────────────────────────────────────┐
│ QUICK ACTIONS                       │
│  [↑] Send                           │
│  [↓] Receive                        │
├─────────────────────────────────────┤
│ PORTFOLIO                           │
│  [📊] Overview                      │
│  [💰] Staking                       │
│  [🔗] Nasun Link                    │
├─────────────────────────────────────┤
│ ACCOUNT                             │
│  [🛡] Smart Account     [2/3 ✓]    │
│  [📋] Address Book                  │
│  [⚙] Settings                       │
├─────────────────────────────────────┤
│  [❓] Help & Support                │
│                      [🔒 Lock]      │
└─────────────────────────────────────┘
```

**변경 사항**:
- 섹션 헤더 추가 (QUICK ACTIONS, PORTFOLIO, ACCOUNT)
- Smart Account에 Recovery 상태 배지 표시
- Help & Support 추가 (신규)
- Export Private Key, Delete Wallet → Settings 내부로 이동

---

### 4.5 헬프센터 통합 (신규)

**시장 인사이트**: 78%가 고객 지원을 플랫폼 선택의 핵심 기준으로 꼽음

**현재 상태**: 지원 채널 없음

**개선안**:

```
┌─────────────────────────────────────┐
│ [<] Help & Support                  │
├─────────────────────────────────────┤
│                                     │
│ 🔍 Search help articles...          │
│                                     │
├─────────────────────────────────────┤
│ POPULAR TOPICS                      │
│                                     │
│ • How to recover my wallet?         │
│ • What is a Smart Account?          │
│ • How to add a Guardian?            │
│ • Transaction failed - what to do?  │
│                                     │
├─────────────────────────────────────┤
│ QUICK ACTIONS                       │
│                                     │
│ [📖] Documentation                  │
│ [💬] Community (Discord)            │
│ [🐛] Report a Bug                   │
│                                     │
└─────────────────────────────────────┘
```

---

### 4.6 플로우(Flow)의 모달화

**현재 문제**: 모든 화면이 동일한 레벨에서 렌더링

**개선안**:

| Flow | 현재 | 개선 |
|------|------|------|
| send | ViewMode | Modal overlay |
| receive | ViewMode | Modal overlay |
| create/import | ViewMode | Full-screen wizard |
| nsa-* flows | ViewMode | Slide panel |
| ledger-* | ViewMode | Modal overlay |
| nasun-link | ViewMode | Modal overlay |

**구현 방향**:
```typescript
const [currentScreen, setCurrentScreen] = useState<ScreenMode>('main');
const [activeFlow, setActiveFlow] = useState<FlowMode | null>(null);

return (
  <>
    <ScreenRenderer screen={currentScreen} />
    {activeFlow && <FlowModal flow={activeFlow} onClose={() => setActiveFlow(null)} />}
  </>
);
```

---

### 4.7 상황 기반 점진 공개

**시장 인사이트**: Zengo, Trust Wallet의 성공 요인 = 상황에 맞는 기능 노출

**개선안**:

| 상황 | 표시할 요소 | 메시지 |
|------|-------------|--------|
| 잔액 0 | Faucet 강조 | "Get free test tokens" |
| 첫 토큰 수신 | Send 안내 | "You can now send tokens" |
| 잔액 > $100 | 복구 권유 | "Protect your assets with recovery" |
| 대규모 전송 | Safety 경고 | "Large transaction detected" |
| Smart Account 미설정 | 업그레이드 카드 | "Enable social recovery" |
| Recovery 미완료 | 완료 권유 | "Complete your recovery setup" |

---

### 4.8 한국 사용자 특화 (향후)

**시장 인사이트**: 1,600만 한국 암호화폐 사용자, 한글 지원 수요 높음

**향후 고려사항**:
- i18n 인프라 구축 (현재 영어 전용)
- 한글 UI 텍스트
- 한국 커뮤니티 지원 채널 (카카오톡, 네이버 카페)
- 원화 표시 옵션

**우선순위**: Phase 4 이후 별도 프로젝트로 진행

---

## 5. 구현 우선순위

### Phase 1: Quick Wins ✅ COMPLETED (2026-01-25)

1. **드롭다운 메뉴 섹션 헤더 추가** ✅
   - 파일: `WalletConnect.tsx`
   - 섹션: Quick Actions, Portfolio, Account
   - zkLogin과 Local wallet 모두 적용

2. **Recovery Readiness 리네이밍** ✅
   - "Trinity Progress" → "Recovery Readiness"
   - "Security Level" → "Recovery Readiness"
   - "Trinity Recovery" → "Never Lose Access"
   - 파일: `NsaAccountInfo.tsx`, `NsaSetupWizard.tsx`

3. **온보딩 순서 변경** ✅
   - zkLogin을 "Quick Start (Recommended)"로 최상단 배치
   - "No seed phrase needed" 메시지 추가
   - "Or use traditional wallet" 섹션 분리
   - 파일: `WalletConnect.tsx` (disconnected state)

4. **Smart Account 배지 추가** ✅
   - 메뉴에 "X/3" 형태의 Recovery Readiness 상태 배지
   - 3/3 완료 시 녹색 배경 + 체크마크
   - 파일: `WalletConnect.tsx`

### Phase 2: Safety & Recovery (2-4 weeks)

1. **트랜잭션 Safety Score UI**
   - 신규 `SafetyScore.tsx` 컴포넌트
   - `SendTransaction.tsx` 통합
   - 난이도: 중간

2. **Recovery Readiness 카드 개선**
   - 진행률 바, 상세 설명 추가
   - 파일: `NsaAccountInfo.tsx`
   - 난이도: 중간

3. **Help & Support 화면 추가**
   - 신규 `HelpCenter.tsx`
   - 난이도: 중간

### Phase 3: Flow Separation (4-6 weeks)

1. **FlowModal 컴포넌트 생성**
   - 파일: 신규 `FlowModal.tsx`
   - 난이도: 중간

2. **Send/Receive 플로우 분리**
   - 파일: `WalletConnect.tsx`
   - 난이도: 중간

3. **Settings 화면 확장**
   - 파일: `SecuritySettings.tsx` → `Settings.tsx`
   - 난이도: 중간

### Phase 4: Long-term

1. **WalletConnect.tsx 분할**
   - 2,000+ lines → 여러 컴포넌트로 분리
   - 난이도: 높음

2. **상황 기반 배너 시스템**
   - ContextualTip 컴포넌트
   - 난이도: 중간

3. **애니메이션 개선**
   - 화면 전환 트랜지션
   - 난이도: 중간

4. **i18n 인프라** (별도 프로젝트)
   - 한국어 지원
   - 난이도: 높음

---

## 6. 경쟁사 대비 차별화 전략

### 6.1 포지셔닝 메시지

| 경쟁사 | 메시지 | 나선 월렛 차별화 |
|--------|--------|------------------|
| Zengo | "Never lose access" | "Recover from anything" |
| MetaMask | "The crypto wallet for DeFi" | "Simple + Powerful" |
| Trust Wallet | "100+ chains" | "Nasun-native, multi-chain ready" |
| Coinbase | "The easiest crypto wallet" | "Easy AND secure" |

### 6.2 핵심 강점 강조 방향

1. **zkLogin**: "No seed phrase, no problem"
2. **Smart Account**: "Multi-signer protection"
3. **Guardian Recovery**: "Friends can help you recover"
4. **Clear Signing**: "See what you're signing"
5. **Gasless**: "We pay your gas fees"

---

## 7. 성공 지표

| 지표 | 현재 | 목표 |
|------|------|------|
| 온보딩 완료율 | - | 80% |
| Recovery 설정 완료율 | - | 60% |
| 메뉴 클릭 깊이 (Send) | 2 clicks | 2 clicks (유지) |
| 메뉴 항목 수 | 11개 | 8개 (그룹화) |
| ViewMode 수 | 23개 | 12개 화면 + 11개 플로우 |
| WalletConnect.tsx 라인 수 | 2,075 | 1,500 이하 |
| 사용자 피드백 | - | "깔끔하고 안전하다" |

---

## 8. 채택하지 않는 제안 (명시적 거부)

| 제안 | 거부 사유 |
|------|-----------|
| 4탭 하단 네비게이션 | 패널 형태 지갑에 부적합, 공간 낭비 |
| React Router 도입 | 오버엔지니어링, 위젯에 불필요 |
| 초보/고급 모드 라벨링 | 사용자에게 부정적 인상 |
| 시간 기반 기능 공개 | 복잡성 증가, 예측 불가 |
| Smart Account = 보안 레벨 | 잘못된 프레이밍, "복구"가 정확 |

---

## 9. 참고 자료

- [WALLET_UI_MOCKUP.md](./WALLET_UI_MOCKUP.md) - 현재 UI 목업
- [WalletConnect.tsx](../../wallet-ui/src/WalletConnect.tsx) - 메인 컴포넌트
- [NsaAccountInfo.tsx](../../wallet-ui/src/nsa/NsaAccountInfo.tsx) - Smart Account UI
- 2026 Blockchain Wallet Market Analysis Report

---

## Appendix A: 시장 분석 요약

### A.1 주요 월렛 UX 강점

| 월렛 | 핵심 UX 강점 |
|------|--------------|
| Zengo | MPC 시드리스, ClearSign, 3FA, 해킹 0건 |
| MetaMask | EVM 표준, Snaps 확장성, DApp 호환 |
| Trust Wallet | 100+ 체인, 모바일 퍼스트, 간편 온보딩 |
| Coinbase | 소셜 로그인, 거래소 연동, USDC 리워드 |
| Tangem | NFC 카드형, 멀티카드 백업, 내구성 |
| Ledger | 하드웨어 보안, 5,500+ 자산, Bluetooth |

### A.2 사용자 피드백 핵심 키워드

| 긍정 | 부정 |
|------|------|
| "시드 없이 복구" | "시드 관리 부담" |
| "빠른 온보딩" | "복잡한 복구" |
| "직관적 UI" | "작은 화면" |
| "모바일 편의성" | "고객 지원 지연" |
| "위험 탐지" | "높은 수수료" |

### A.3 한국 시장 특성

- 1,600만 암호화폐 사용자 (인구 31%)
- 모바일·앱 기반 월렛 선호
- 한글 지원, 빠른 고객 지원 수요 높음
- 규제 불확실성 → KYC 미요구 월렛 인지도 상승

---

## Appendix B: 현재 ViewMode 전체 목록

1. main
2. create
3. create-backup
4. unlock
5. import
6. export
7. send
8. receive
9. nfts
10. staking
11. settings
12. ledger-connect
13. ledger-select
14. address-book
15. portfolio
16. nasun-link
17. nsa-setup
18. nsa-info
19. nsa-add-signer
20. nsa-accept-proposal
21. nsa-backup
22. nsa-guardians
23. nsa-recovery
