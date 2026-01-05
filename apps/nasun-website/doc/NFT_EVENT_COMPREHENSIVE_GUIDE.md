# Wave 1 Battalion NFT Event 종합 가이드

**Last Updated**: 2025-10-29
**Version**: v1.0.0
**Status**: ✅ Phase 1-5 구현 완료
**작성자**: Claude Code

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 아키텍처](#2-기술-아키텍처)
3. [Phase 1-5 구현 계획](#3-phase-1-5-구현-계획)
4. [완료 히스토리 및 버그 수정](#4-완료-히스토리-및-버그-수정)
5. [E2E 테스트 가이드](#5-e2e-테스트-가이드)
6. [환경 변수 설정](#6-환경-변수-설정)
7. [배포 가이드](#7-배포-가이드)
8. [롤백 전략](#8-롤백-전략)
9. [운영 및 관리](#9-운영-및-관리)

---

## 1. 프로젝트 개요

### 🎯 목표

**Wave 1 Battalion NFT Free Mint 이벤트**를 통해 초기 커뮤니티를 구축하고, X(Twitter) 참여도를 높이는 동시에 안전하고 확장 가능한 Web3 이벤트 시스템을 구축합니다.

### 📊 핵심 지표

- **목표 참여자**: 1,000명 (1주일)
- **NFT 공급량**: 10,000개
- **X API 검증 성공률**: 95% 이상
- **평균 등록 완료 시간**: 3분 이내
- **시스템 가용성**: 99.9%

### 🎁 이벤트 혜택

1. **Wave 1 Battalion NFT** (무료 민팅)
2. **주간 래플**: Genesis NFT 추첨권
3. **GTD 화이트리스트**: 추가 추첨 기회
4. **Engagement 점수**: 참여도에 따른 확률 증가

### 핵심 기능

Wave 1 Battalion NFT Free Mint 이벤트는 X(Twitter) 사용자의 참여를 기반으로 한 화이트리스트 등록 시스템입니다.

**주요 기능**:
- ✅ X(Twitter) OAuth 2.0 인증
- ✅ 태스크 검증 (Like, Retweet)
- ✅ MetaMask 지갑 연결
- ✅ 화이트리스트 등록
- ✅ 관리자용 CSV Export (OpenSea Allowlist 포맷)

### ⚠️ 핵심 원칙

1. **보안 최우선**: 댓글로 지갑 수집 금지, MetaMask 연결만 사용
2. **완전 자동화**: X API로 팔로우/좋아요/리트윗 자동 검증
3. **사용자 중심 UX**: 6단계 명확한 플로우, 실시간 피드백
4. **안전한 롤백**: Feature Flag, Lambda 버전 관리, DB 백업

---

## 2. 기술 아키텍처

### 📦 전체 시스템 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │ WaveOneEvent│  │ Dashboard │  │ MetaMask Integration  │ │
│  │ Components  │  │ Component │  │ (ethers.js)           │ │
│  └────────────┘  └────────────┘  └────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS (API Gateway)
┌───────────────────────────┼─────────────────────────────────┐
│                    API Gateway (REST API)                    │
│  POST /event/verify       POST /event/register              │
│  GET  /admin/export-csv                                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                  Lambda Functions (Node.js 18)               │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ verify-eligibility│  │ register-user│  │ export-csv    │
│  │ - X API 검증     │  │ - 화이트리스트│  │ - DynamoDB to │
│  │ - Rate Limit     │  │   등록        │  │   CSV 변환    │
│  └──────────────────┘  └──────────────┘  └───────────────┘ │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│              DynamoDB (NoSQL Database)                       │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │ NftWhitelist     │  │ EventTasks                       │ │
│  │ PK: walletAddress│  │ PK: walletAddress, SK: taskType │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    OpenSea Studio                            │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Wave 1 Battalion Drop (ERC-721)                         ││
│  │ - CSV Allowlist 기반 민팅                              ││
│  │ - Presale Stage (Free Mint, 가스비만)                  ││
│  │ - Per-wallet limit: 1 NFT                               ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 🔑 기술 스택

| 레이어 | 기술 | 버전 |
|--------|------|------|
| **Frontend** | React + TypeScript | 18.3.1 |
| **Build Tool** | Vite | 6.0.7 |
| **Web3** | ethers.js | 6.15.0 |
| **State** | Zustand | - |
| **UI** | Radix UI + Tailwind | - |
| **i18n** | i18next | - |
| **Backend** | AWS Lambda (Node.js) | 18.x |
| **IaC** | AWS CDK (TypeScript) | - |
| **Database** | DynamoDB | - |
| **API** | API Gateway (REST) | - |
| **X API** | twitter-api-v2 | latest |
| **Blockchain** | Solidity | 0.8.20 |
| **Testing** | Hardhat | - |

### 📊 DynamoDB 테이블 설계

#### 테이블 1: NftWhitelist

**용도**: 화이트리스트 등록된 지갑 주소 저장

```typescript
interface NftWhitelist {
  walletAddress: string;        // PK (소문자 정규화)
  xUserId: string;               // X(Twitter) User ID
  xUsername: string;             // X(Twitter) Username
  verifiedAt: string;            // ISO 8601 타임스탬프
  engagementScore: number;       // 초기값: 0
  status: 'ACTIVE' | 'MINTED';   // 상태
  mintedAt?: string;             // 민팅 완료 시간 (옵션)
  referralCode?: string;         // 추천인 코드 (향후 확장)
}
```

**GSI (Global Secondary Index)**:
- `xUserId-index`: X 사용자 ID로 조회 (중복 등록 방지)
- `status-index`: 상태별 조회 (CSV export 최적화용, RCU 비용 80% 절감)

#### 테이블 2: EventTasks

**용도**: 사용자별 작업 완료 상태 추적 (디버깅, 분석, Rate Limit 캐싱)

```typescript
interface EventTask {
  walletAddress: string;         // PK
  taskType: string;              // SK: 'LIKE' | 'RETWEET'
  completed: boolean;            // 완료 여부
  completedAt?: string;          // 완료 시간
  xUserId: string;               // X User ID
  metadata?: {                   // 추가 메타데이터
    tweetId?: string;
    apiCallCount?: number;
    lastCheckedAt?: string;      // 캐싱 용도 (15분 이내 재검증 시 skip)
    copiedFrom?: string;         // 태스크 복사 출처
  };
}
```

**Rate Limit 최적화 전략**:
- `lastCheckedAt`가 15분 이내이고 `completed: true`인 경우 X API 재호출 skip
- API 호출 75% 절감 효과 (Basic 플랜: 월 10,000회 → 2,500회)

---

## 3. Phase 1-5 구현 계획

### Phase 1: 인프라 구축 ✅

**예상 기간**: 3-4일
**목표**: AWS 리소스 생성, Feature Flag 설정, 배포 파이프라인 구축

**완료된 작업**:
- ✅ DynamoDB 테이블 생성 (NftWhitelist, EventTasks)
- ✅ Lambda 함수 생성 (verify-eligibility, register-user, export-csv)
- ✅ API Gateway 엔드포인트 설정
- ✅ IAM 권한 설정
- ✅ CloudWatch 로그 그룹 생성
- ✅ Point-in-time 복구 활성화

**주요 리소스**:
- **Lambda Functions**:
  - `nasun-nft-verify-eligibility`: X API 태스크 검증
  - `nasun-nft-register-user`: 화이트리스트 등록
  - `nasun-nft-export-csv`: CSV Export (관리자 전용)
- **DynamoDB Tables**:
  - `nasun-nft-whitelist`: 화이트리스트 데이터
  - `nasun-nft-event-tasks`: 태스크 추적 데이터
- **API Endpoints**:
  - `POST /event/verify`: 태스크 검증
  - `POST /event/register`: 화이트리스트 등록
  - `GET /admin/export-csv`: CSV Export

### Phase 2: 백엔드 로직 구현 ✅

**예상 기간**: 4-5일
**목표**: X API 통합, 검증 로직, 화이트리스트 등록, CSV Export

**완료된 작업**:
- ✅ X API 클라이언트 구현 (twitter-api-v2)
- ✅ Like/Retweet 검증 로직
- ✅ Follow 검증 제거 (X API Basic Plan 제약)
- ✅ 화이트리스트 등록 로직
- ✅ 중복 방지 로직 (walletAddress, xUserId)
- ✅ Task Tracker 구현 (태스크 복사 메커니즘)
- ✅ CSV Export 로직 (OpenSea Allowlist 포맷)

**주요 개선사항**:
- **Follow 검증 제거**: X API Basic Plan은 `/2/users/:id/following` 엔드포인트 미지원 (Enterprise Plan $42,000/month 필요)
  - Follow는 Intent URL로 선택적 권장: `https://twitter.com/intent/follow?screen_name=${targetAccount}`
- **Task Tracker 메커니즘**: xUserId로 임시 저장 → 실제 walletAddress로 복사
  - Step 3 검증 시: `walletAddress: xUserId` (임시)
  - Step 5 등록 시: `walletAddress: 실제 주소` (복사)

### Phase 3: 프론트엔드 UX 구현 ✅

**예상 기간**: 5-6일
**목표**: 6단계 사용자 플로우, Zustand 상태 관리, MetaMask 통합

**완료된 작업**:
- ✅ NftEventPage 컴포넌트 (6단계 플로우)
- ✅ Zustand Store (`useNftEventStore`)
- ✅ LocalStorage 영속화
- ✅ StepperProgress 컴포넌트
- ✅ 6개 Step 카드 컴포넌트
- ✅ X Auth 통합 (OAuth 2.0 PKCE)
- ✅ MetaMask 연결
- ✅ i18n 번역 (한국어/영어)
- ✅ 다크 모드 지원

**6단계 사용자 플로우**:
1. **Step 1: Intro** - 이벤트 소개 및 요구사항
2. **Step 2: X Auth** - Twitter OAuth 2.0 로그인
3. **Step 3: Task Verification** - Like/Retweet 검증
4. **Step 4: Wallet Connect** - MetaMask 지갑 연결
5. **Step 5: Register** - 화이트리스트 등록
6. **Step 6: Complete** - 등록 완료 확인

**Zustand Store 구조**:
```typescript
interface NftEventStore {
  currentStep: number;
  xUserId: string;
  xUsername: string;
  walletAddress: string;
  verificationResult: VerificationResult | null;
  isRegistered: boolean;

  setXAuth: (userId: string, username: string) => void;
  setVerification: (result: VerificationResult) => void;
  setWalletAddress: (address: string) => void;
  setRegistered: () => void;
  reset: () => void;
}
```

### Phase 4: OpenSea 드롭 설정 ✅

**예상 기간**: 2일
**목표**: OpenSea Studio에서 NFT 컬렉션 생성 및 Allowlist 업로드

**완료된 작업**:
- ✅ OpenSea Studio 접속 및 컬렉션 생성
- ✅ Wave 1 Battalion NFT 메타데이터 준비
- ✅ CSV Export 기능 구현
- ✅ Allowlist 업로드 테스트

**OpenSea CSV 포맷**:
```
0x742d35cc6634c0532925a3b844bc9e7595f0beb7
0x1234567890abcdef1234567890abcdef12345678
...
```
- 헤더 없음
- 1줄에 1개 주소
- 소문자 정규화
- 중복 제거

### Phase 5: E2E 테스트 & 배포 ✅

**예상 기간**: 3-4일
**목표**: 전체 플로우 테스트 및 프로덕션 배포

**완료된 작업**:
- ✅ Happy Path 테스트 (전체 6단계)
- ✅ Task Incomplete Path 테스트
- ✅ Already Registered Path 테스트
- ✅ 버그 수정 (6건)
- ✅ 프로덕션 배포

---

## 4. 완료 히스토리 및 버그 수정

### 구현 일자

**Phase 1-3**: 2025-10-25
**Phase 4-5**: 2025-10-25

### 버그 수정 기록 (6건)

#### BUG-001: Step 전환 번호 불일치

**문제**: X Auth 완료 후 Step 2에서 멈춤
**원인**: `useNftEventStore.ts`의 step 번호가 1씩 작음
**해결**: 모든 step 전환 번호 +1
```typescript
setXAuth: (userId, username) => {
  set({ currentStep: 3 }); // 2 → 3
}
```
**수정 일자**: 2025-10-25

#### BUG-002: Follow 검증 실패

**문제**: 403 "client-not-enrolled" 에러
**원인**: X API Basic Plan은 Following 엔드포인트 미지원
**해결**: Follow 검증 완전 제거, Intent URL로 대체
**수정 일자**: 2025-10-25

#### BUG-003: Invalid wallet address

**문제**: Step 3에서 walletAddress 검증 실패
**원인**: verify-eligibility Lambda가 Ethereum 주소만 허용
**해결**: xUserId (숫자 문자열)도 허용하도록 검증 완화
```typescript
const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
const isXUserId = /^\d+$/.test(walletAddress);
if (!isEthereumAddress && !isXUserId) throw error;
```
**수정 일자**: 2025-10-25

#### BUG-004: Tasks not completed

**문제**: 화이트리스트 등록 시 "태스크 미완료" 에러
**원인**:
- Step 3: xUserId로 태스크 저장 (`walletAddress: "265284922"`)
- Step 5: 실제 wallet address로 조회 (`walletAddress: "0x409f..."`)
- DynamoDB 미스매치 → 태스크 0개 발견

**해결**:
1. register-user Lambda에서 xUserId로 조회
2. copyTasks() 메서드로 실제 walletAddress에 복사
```typescript
// 1. xUserId로 태스크 조회
const allTasksCompleted = await taskTracker.areAllTasksCompleted(xUserId);

// 2. 실제 walletAddress로 복사
await taskTracker.copyTasks(xUserId, walletAddress, xUsername);
```
**수정 일자**: 2025-10-25

#### BUG-005: AccessDeniedException

**문제**: register-user Lambda PutItem 권한 없음
**원인**: `nft-event-stack.ts`에서 EventTasks 테이블 읽기 권한만 부여
**해결**: 쓰기 권한 추가
```typescript
// Before
this.tasksTable.grantReadData(registerUserLambda);

// After
this.tasksTable.grantReadWriteData(registerUserLambda);
```
**수정 일자**: 2025-10-25

#### BUG-006: 검증 완료 후 자동 이동

**문제**: "Verify Tasks" 버튼 클릭 시 바로 Step 4로 이동
**원인**: `handleVerify` 함수에서 검증 성공 시 자동으로 `onVerificationSuccess` 호출
**해결**: 자동 호출 제거, 사용자가 "Next Step" 버튼 클릭해야 이동
**수정 일자**: 2025-10-25

### 지갑 재연결 UX 개선 (2025-11-02) ✅

**배경**: 등록 완료 후 지갑 연결을 해제한 사용자가 재방문했을 때, "등록 완료" 메시지는 보이지만 실제 지갑은 연결되지 않은 상태라 혼란을 겪음.

**구현 내용**:
1. **WalletDisconnectedCard 컴포넌트**: 지갑 미연결 상태 감지 시 경고 카드 표시.
2. **재연결 프로세스**: "Reconnect MetaMask" 클릭 → My Account 이동 → 지갑 연결 → 자동 복원.
3. **초기화 옵션**: "Reset Registration" 클릭 → 로컬 상태 초기화 및 Step 1 복귀.
4. **조건부 렌더링**: Step 6에서 `registered=true`이지만 지갑이 없는 경우를 처리.

**수정된 파일**:
- `WalletDisconnectedCard.tsx` (신규)
- `RegistrationSuccessCard.tsx` (Props 추가)
- `NftEventPage.tsx` (로직 개선)
- `i18n` 번역 파일 (en/ko)

**UX 플로우**:
```
[사용자 재방문]
    ↓
[Step 6: 등록 완료 상태 감지]
    ↓
지갑 연결됨?
    ├─ YES → [RegistrationSuccessCard] (기존 성공 화면)
    └─ NO  → [WalletDisconnectedCard] (경고 및 안내)
                 ├─ [Reconnect] → My Account로 이동
                 └─ [Reset] → 초기화 후 Step 1으로 이동
```

### 최종 아키텍처 플로우

```
[Step 2: X Auth]
    ↓ (xUserId, xUsername, xAccessToken 저장)
[Step 3: Task Verification]
    ↓ (walletAddress: xUserId로 임시 저장)
[Step 4: Wallet Connect]
    ↓ (실제 walletAddress 획득)
[Step 5: Register]
    ↓ (xUserId로 태스크 조회 → walletAddress로 복사)
[Step 6: Complete]
```

### DynamoDB 태스크 추적 메커니즘

```
Phase 1 (Step 3 검증):
┌─────────────────────────────────┐
│ EventTasks Table                │
├─────────────────────────────────┤
│ walletAddress: "265284922"      │ ← xUserId 임시 사용
│ taskType: "LIKE"                │
│ completed: true                 │
│ xUserId: "265284922"            │
└─────────────────────────────────┘

Phase 2 (Step 5 등록):
┌─────────────────────────────────┐
│ 1. xUserId로 조회 → 2개 발견    │
│ 2. copyTasks() 실행             │
├─────────────────────────────────┤
│ walletAddress: "0x409f..."      │ ← 실제 wallet
│ taskType: "LIKE"                │
│ completed: true                 │
│ xUserId: "265284922"            │
│ metadata.copiedFrom: "265284922"│
└─────────────────────────────────┘
```

---

## 5. E2E 테스트 가이드

### 🛠️ 사전 준비

#### 1. 환경 설정

```bash
# 1. 프론트엔드 개발 서버 시작
cd /home/naru/my_apps/nasun-apps/nasun-website/frontend
pnpm dev

# 2. 브라우저에서 접속
# URL: http://localhost:5174/nft-event
```

#### 2. 필수 도구

- ✅ **Chrome 브라우저** (DevTools 사용)
- ✅ **X (Twitter) 계정** (실제 계정 권장, 테스트 계정도 가능)
- ✅ **MetaMask 확장 프로그램** (설치 필수)
- ✅ **Sepolia Testnet ETH** (소량, 가스비 불필요하지만 네트워크 연결 필요)

#### 3. 환경 변수 확인

```bash
# frontend/.env.development 파일 확인
cat .env.development | grep NFT_EVENT

# 예상 출력:
# VITE_ENABLE_NFT_EVENT=true
# VITE_NFT_EVENT_API=https://qn93k96d60.execute-api.ap-northeast-2.amazonaws.com/prod/event
# VITE_EVENT_TWEET_ID=1981609250695840045
```

### 📝 테스트 체크리스트

각 Step을 완료할 때마다 체크박스에 표시하세요.

- [ ] **Step 1**: 이벤트 소개 페이지
- [ ] **Step 2**: X (Twitter) OAuth 로그인
- [ ] **Step 3**: 태스크 검증
- [ ] **Step 4**: MetaMask 지갑 연결
- [ ] **Step 5**: 화이트리스트 등록
- [ ] **Step 6**: 등록 완료 페이지
- [ ] **추가 테스트**: 상태 영속화 (새로고침)
- [ ] **추가 테스트**: 에러 핸들링
- [ ] **추가 테스트**: 다크 모드

### Step 1: 이벤트 소개 페이지

#### 액션
1. 브라우저에서 `http://localhost:5174/nft-event` 접속
2. 페이지 로딩 확인

#### 예상 결과
✅ **페이지 제목**: "Wave 1 Battalion NFT Free Mint"
✅ **Stepper Progress**: Step 1이 활성화됨
✅ **카드 표시**:
   - 아이콘 (파란색 책 모양)
   - 제목: "Wave 1 Battalion NFT Free Mint 이벤트"
   - 설명 텍스트
✅ **요구사항 섹션**:
   - 📋 참여 조건
   - ✅ @Nasun_io 팔로우
   - ✅ 이벤트 트윗 좋아요
   - ✅ 이벤트 트윗 리트윗
   - ✅ MetaMask 지갑 연결
✅ **보상 섹션**:
   - 🎁 혜택
   - 🏆 Wave 1 Battalion NFT 무료 민팅
   - 🎨 고유한 NFT 소유
   - 👥 커뮤니티 멤버십
✅ **"시작하기" 버튼**: 파란색, 클릭 가능

#### 디버깅 (선택사항)
```javascript
// 브라우저 콘솔 (F12)
localStorage.getItem('nft-event-state')
// → null 또는 undefined (첫 방문 시)
```

#### 액션 (계속)
3. **"시작하기" 버튼 클릭**

#### 예상 결과
✅ Step 2 (X Auth) 페이지로 전환
✅ StepperProgress가 Step 2로 업데이트
✅ URL 변경 없음 (SPA 라우팅)

### Step 2: X (Twitter) OAuth 로그인

#### 예상 화면
✅ **제목**: "X (Twitter) 계정 연동"
✅ **설명**: "이벤트 참여 조건을 확인하기 위해 X 계정을 연동해주세요."
✅ **정보 박스** (파란색):
   - 아이콘: ℹ️
   - "왜 X 연동이 필요한가요?"
   - 설명: "이벤트 참여 조건(팔로우, 좋아요, 리트윗)을 확인하기 위해..."
✅ **"X로 로그인" 버튼**: 파란색, Twitter 아이콘

#### 액션
1. **"X로 로그인" 버튼 클릭**

#### 예상 결과
✅ 버튼이 로딩 상태로 변경:
   - 스피너 아이콘 표시
   - 텍스트: "연결 중..."
   - 버튼 비활성화
✅ 잠시 후 Twitter OAuth 페이지로 리디렉션
✅ Twitter 승인 화면 표시:
   - 앱 이름: "NASUN Twitter OAuth"
   - 요청 권한: "Read access to your account"

#### 액션 (계속)
2. **Twitter OAuth 승인 (Authorize app 클릭)**

#### 예상 결과
✅ 콜백 URL로 리디렉션: `http://localhost:5174/nft-event?code=...&state=...`
✅ 페이지가 자동으로 Step 3으로 전환
✅ 사용자 정보가 저장됨 (Zustand Store + LocalStorage)

#### 디버깅
```javascript
// 브라우저 콘솔
const state = JSON.parse(localStorage.getItem('nft-event-state'));
console.log(state);
// 예상 출력:
// {
//   currentStep: 3,
//   xUserId: "1234567890",
//   xUsername: "YourTwitterUsername",
//   ...
// }
```

### Step 3: 태스크 검증

#### 예상 화면
✅ **제목**: "X 태스크 확인"
✅ **사용자 정보 표시**:
   - "연결된 계정: @{YourTwitterUsername}"
✅ **태스크 목록**:
   1. @Nasun_io 팔로우 (선택사항, Intent URL)
   2. 이벤트 트윗 좋아요
   3. 이벤트 트윗 리트윗
✅ **"태스크 확인하기" 버튼**: 파란색

#### 사전 준비 (중요!)
⚠️ **테스트를 진행하기 전에, 실제 X 계정으로 다음 작업을 수행하세요:**

1. **@Nasun_io 팔로우**
   - URL: https://x.com/Nasun_io
   - "Follow" 버튼 클릭
2. **이벤트 트윗 찾기**
   - Tweet ID: `1981609250695840045`
   - URL: https://x.com/Nasun_io/status/1981609250695840045
3. **이벤트 트윗 좋아요** (❤️ 버튼 클릭)
4. **이벤트 트윗 리트윗** (🔁 버튼 클릭)

#### 액션
1. **"태스크 확인하기" 버튼 클릭**

#### 예상 결과 (모든 태스크 완료 시)
✅ 버튼이 로딩 상태로 변경
✅ API 호출: `POST /event/verify`
✅ 잠시 후 태스크 목록이 업데이트됨:
   - ✅ 이벤트 트윗 좋아요 (초록색 체크)
   - ✅ 이벤트 트윗 리트윗 (초록색 체크)
✅ **"다음 단계" 버튼 활성화** (초록색 또는 파란색)

#### 액션 (계속)
2. **"다음 단계" 버튼 클릭**

#### 예상 결과
✅ Step 4 (지갑 연결) 페이지로 전환
✅ StepperProgress가 Step 4로 업데이트

### Step 4: MetaMask 지갑 연결

#### 예상 화면
✅ **제목**: "지갑 연결"
✅ **설명**: "NFT를 받을 지갑 주소를 연결해주세요."
✅ **MetaMask 아이콘**
✅ **"MetaMask 연결" 버튼**: 주황색

#### 사전 준비
⚠️ **MetaMask 확장 프로그램이 설치되어 있어야 합니다.**
- 미설치 시: https://metamask.io/download/
- 네트워크: Sepolia Testnet (권장, Mainnet도 가능)

#### 액션
1. **"MetaMask 연결" 버튼 클릭**

#### 예상 결과
✅ MetaMask 팝업이 나타남
✅ 팝업 내용:
   - "Connect with MetaMask"
   - 계정 선택 화면
   - 권한 요청

#### 액션 (계속)
2. **MetaMask 팝업에서 "Next" → "Connect" 클릭**

#### 예상 결과
✅ 지갑 주소가 연결됨
✅ Step 5 (등록 확인) 페이지로 자동 전환
✅ StepperProgress가 Step 5로 업데이트

#### 디버깅
```javascript
// 브라우저 콘솔
const state = JSON.parse(localStorage.getItem('nft-event-state'));
console.log(state.walletAddress);
// 예상 출력: "0x742d35Cc6634C0532925a3b844Bc9e7595f0beb7"
```

### Step 5: 화이트리스트 등록

#### 예상 화면
✅ **제목**: "화이트리스트 등록"
✅ **설명**: "아래 정보를 확인하고 화이트리스트에 등록하세요."
✅ **요약 정보 카드**:
   1. **X Account**: `@{YourTwitterUsername}`
   2. **Wallet Address**: `0x742d...f0beb7` (축약)
   3. **Tasks Completed**: ✅ All tasks completed
✅ **"화이트리스트 등록" 버튼**: 보라색

#### 액션
1. **정보 확인** (X 계정, 지갑 주소, 태스크 완료 여부)
2. **"화이트리스트 등록" 버튼 클릭**

#### 예상 결과
✅ 버튼이 로딩 상태로 변경:
   - 스피너 아이콘 표시
   - 텍스트: "등록 중..."
   - 버튼 비활성화
✅ API 호출: `POST /event/register`
✅ 잠시 후 (3-5초):
   - Step 6 (등록 완료) 페이지로 전환
   - StepperProgress가 Step 6로 업데이트

#### 디버깅
```javascript
// 브라우저 콘솔
const state = JSON.parse(localStorage.getItem('nft-event-state'));
console.log(state.registered); // → true
console.log(state.whitelist);
// 예상 출력:
// {
//   walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0beb7",
//   xUserId: "1234567890",
//   xUsername: "YourTwitterUsername",
//   registeredAt: "2025-10-25T07:00:00.000Z"
// }
```

### Step 6: 등록 완료

#### 예상 화면
✅ **제목**: "등록 완료!"
✅ **축하 메시지**: "Wave 1 Battalion NFT 화이트리스트에 성공적으로 등록되었습니다!"
✅ **체크마크 아이콘** (초록색, 큰 원형)
✅ **등록 정보 요약**:
   - X Account
   - Wallet Address
   - 등록 시간
✅ **다음 단계 안내**:
   - 📅 민팅 시작일: (날짜)
   - 🔗 OpenSea 링크
   - 📖 민팅 가이드
✅ **"완료" 버튼**: 초록색

#### 액션
1. **정보 확인**
2. **"완료" 버튼 클릭** (옵션)

#### 예상 결과
✅ 홈페이지(`/`)로 리디렉션 (또는 현재 페이지 유지)

### Step 7: 지갑 재연결 시나리오 (2025-11-02 추가)

#### 상황
사용자가 등록을 완료한 후 My Account 페이지에서 지갑 연결을 해제하고, 다시 이벤트 페이지로 돌아온 경우.

#### 예상 화면
✅ **제목**: "⚠️ Wallet Disconnected" (지갑 연결 해제됨)
✅ **설명**: "등록 정보는 저장되었지만 MetaMask 지갑 연결이 해제되었습니다."
✅ **버튼**:
   - "Reconnect MetaMask" (재연결)
   - "Reset Registration" (초기화)

#### 액션 1: 재연결
1. **"Reconnect MetaMask" 클릭**
2. My Account 페이지로 이동 확인
3. 지갑 다시 연결
4. NFT Event 페이지로 복귀
   - ✅ 자동으로 Step 6 (등록 완료) 화면이 표시되어야 함

#### 액션 2: 초기화 (선택사항)
1. **"Reset Registration" 클릭**
2. 확인 팝업에서 "확인" 클릭
3. Step 1 (인트로) 화면으로 초기화되는지 확인

### 추가 테스트

#### 1. 상태 영속화 (LocalStorage)

**테스트 1: 페이지 새로고침**
**시나리오**: Step 3에서 작업 중 브라우저 새로고침
**액션**:
1. Step 3까지 진행
2. `F5` 또는 새로고침 버튼 클릭
**예상 결과**:
- ✅ LocalStorage에서 상태 복원
- ✅ Step 3으로 자동 복귀
- ✅ X 계정 정보 유지
- ✅ StepperProgress 정확히 표시

#### 2. 에러 핸들링

**네트워크 에러 시뮬레이션**
**시나리오**: 태스크 검증 중 네트워크 차단
**액션**:
1. Step 3 페이지 진입
2. Chrome DevTools 열기 (F12)
3. Network 탭 → Offline 체크박스 선택
4. "태스크 확인하기" 버튼 클릭
**예상 결과**:
- ✅ 에러 메시지 표시: "네트워크 오류가 발생했습니다..."
- ✅ 버튼 다시 활성화 (재시도 가능)
- ✅ 상태 롤백 (Step 3 유지)

#### 3. 다크 모드

**다크 모드 전환 테스트**
**시나리오**: 모든 Step에서 다크 모드 확인
**액션**:
1. Step 1부터 Step 6까지 순회
2. 각 Step에서 다크 모드 토글
**예상 결과**:
- ✅ 모든 카드가 `dark:bg-gray-800`
- ✅ 텍스트가 `dark:text-white` 또는 `dark:text-gray-300`
- ✅ 버튼 색상 적절히 조정
- ✅ 에러 박스가 `dark:bg-red-900/20`

### 🎯 성공 기준

Phase 5 E2E 테스트가 성공으로 간주되려면:

- ✅ 모든 6 Step이 정상 작동
- ✅ API 통합이 올바르게 작동
- ✅ 에러 핸들링이 적절히 구현
- ✅ 상태 영속화가 정확히 작동
- ✅ 다크 모드 지원
- ✅ 반응형 디자인 구현
- ✅ **Critical 버그 0개**
- ✅ **High Priority 버그 < 3개**
- ✅ **Medium Priority 버그 < 10개**

---

## 6. 환경 변수 설정

### Frontend 환경 변수

**파일**: `frontend/.env.development`

```bash
# NFT Event Feature Flag
VITE_ENABLE_NFT_EVENT=true

# API Endpoint
VITE_NFT_EVENT_API=https://qn93k96d60.execute-api.ap-northeast-2.amazonaws.com/prod/event

# Event Tweet ID (Like/Retweet 검증용)
VITE_EVENT_TWEET_ID=1981609250695840045

# Target Account (Follow Intent URL용)
VITE_TARGET_ACCOUNT=Nasun_io
```

**파일**: `frontend/.env.production`

```bash
# Production 설정
VITE_ENABLE_NFT_EVENT=true
VITE_NFT_EVENT_API=https://YOUR_PRODUCTION_API/prod/event
VITE_EVENT_TWEET_ID=YOUR_PRODUCTION_TWEET_ID
VITE_TARGET_ACCOUNT=Nasun_io
```

### Backend 환경 변수

**Lambda 함수 환경 변수** (CDK에서 설정):

```typescript
// verify-eligibility Lambda
{
  NFT_WHITELIST_TABLE: 'nasun-nft-whitelist',
  NFT_EVENT_TASKS_TABLE: 'nasun-nft-event-tasks',
  X_API_BEARER_TOKEN: process.env.X_API_BEARER_TOKEN,
  TARGET_ACCOUNT: 'Nasun_io',
  TARGET_TWEET_ID: '1981609250695840045',
  RATE_LIMIT_CACHE_TTL: '900' // 15분 (초)
}

// register-user Lambda
{
  NFT_WHITELIST_TABLE: 'nasun-nft-whitelist',
  NFT_EVENT_TASKS_TABLE: 'nasun-nft-event-tasks'
}

// export-csv Lambda
{
  NFT_WHITELIST_TABLE: 'nasun-nft-whitelist',
  EXPORT_BUCKET: 'nasun-nft-whitelist-exports'
}
```

### Secrets Manager 설정

**Secret Name**: `nft-event/x-api-credentials`

```json
{
  "bearerToken": "AAAAAAAAAAAAAAAAAAAAALxxx...",
  "targetUserId": "1863020068785004544"
}
```

**생성 방법**:
```bash
aws secretsmanager create-secret \
  --name nft-event/x-api-credentials \
  --secret-string '{"bearerToken":"YOUR_BEARER_TOKEN","targetUserId":"YOUR_USER_ID"}' \
  --region ap-northeast-2
```

---

## 7. 배포 가이드

### 백엔드 배포 (CDK)

#### 1. 사전 준비

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# Lambda 함수 빌드
cd lambda-src/nft-event/verify-eligibility
npm install
npm run build
cd ../..

cd lambda-src/nft-event/register-user
npm install
npm run build
cd ../..

cd lambda-src/nft-event/export-csv
npm install
npm run build
cd ../..
```

#### 2. CDK 배포

```bash
# 전체 스택 배포
pnpm cdk deploy NftEventStack --require-approval never

# 또는 안전한 배포 스크립트 사용
pnpm run deploy:safe
```

#### 3. 배포 검증

```bash
# DynamoDB 테이블 확인
aws dynamodb list-tables --region ap-northeast-2 | grep nft

# Lambda 함수 확인
aws lambda list-functions --region ap-northeast-2 | grep nft

# API Gateway 확인
aws apigateway get-rest-apis --region ap-northeast-2

# Lambda 최신 업데이트 확인
aws lambda get-function --function-name nasun-nft-verify-eligibility --query 'Configuration.LastModified'
```

### 프론트엔드 배포

#### 1. 빌드

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/frontend

# 환경 변수 확인
cat .env.production

# 프로덕션 빌드
npm run build

# 빌드 결과 확인
ls -lh dist/
```

#### 2. 미리보기 (선택사항)

```bash
npm run preview
# http://localhost:4173
```

#### 3. 배포

(프론트엔드 호스팅 서비스에 따라 배포 방법이 다름 - 예: S3 + CloudFront, Vercel 등)

### 배포 후 검증

```bash
# API 엔드포인트 테스트
curl -X POST https://PROD_API_URL/prod/event/verify \
  -H "Content-Type: application/json" \
  -d '{"identityId":"test","walletAddress":"0xTEST"}'

# DynamoDB 테이블 확인
aws dynamodb describe-table --table-name nasun-nft-whitelist --region ap-northeast-2

# Lambda 로그 확인
aws logs tail /aws/lambda/nasun-nft-verify-eligibility --region ap-northeast-2 --follow
```

---

## 8. 롤백 전략

### 1. Feature Flag 비활성화 (긴급 롤백)

**시나리오**: 프론트엔드에서 NFT Event 기능을 즉시 숨겨야 할 때

**방법**:
```bash
# .env.production 수정
VITE_ENABLE_NFT_EVENT=false

# 재빌드 및 배포
npm run build
# (프론트엔드 호스팅에 배포)
```

**영향**: 사용자는 NFT Event 메뉴를 볼 수 없음, 백엔드는 계속 작동

**복구 시간**: 5-10분

### 2. Lambda 버전 롤백

**시나리오**: Lambda 함수에서 버그 발견 시

**방법**:
```bash
# 이전 버전으로 되돌리기
aws lambda update-function-code \
  --function-name nasun-nft-verify-eligibility \
  --s3-bucket YOUR_BACKUP_BUCKET \
  --s3-key lambda/verify-eligibility-v1.0.0.zip \
  --region ap-northeast-2
```

**복구 시간**: 2-3분

### 3. DynamoDB Point-in-Time 복구

**시나리오**: 데이터 무결성 문제 발생 시

**방법**:
```bash
# 특정 시점으로 복구
aws dynamodb restore-table-to-point-in-time \
  --source-table-name nasun-nft-whitelist \
  --target-table-name nasun-nft-whitelist-restored \
  --restore-date-time 2025-10-25T12:00:00Z \
  --region ap-northeast-2
```

**복구 시간**: 10-20분 (테이블 크기에 따라)

### 4. Git Revert

**시나리오**: 코드 변경 사항 롤백

**방법**:
```bash
# 특정 커밋으로 되돌리기
git revert COMMIT_HASH

# 재배포
cd cdk
pnpm cdk deploy NftEventStack --require-approval never
```

**복구 시간**: 5-10분

---

## 9. 운영 및 관리

### CSV Export (관리자 전용)

#### 1. API 호출

```bash
# API Key 필요
curl -X GET "https://YOUR_API/prod/admin/export-csv" \
  -H "x-api-key: YOUR_API_KEY" \
  -o whitelist.csv
```

#### 2. OpenSea 업로드

1. OpenSea Studio 접속: https://opensea.io/studio
2. "Wave 1 Battalion" 컬렉션 선택
3. "Allowlist" 탭 클릭
4. "Upload CSV" 버튼 클릭
5. `whitelist.csv` 파일 업로드
6. 검증 완료 후 "Save" 클릭

### 모니터링

#### CloudWatch Logs

```bash
# verify-eligibility Lambda 로그
aws logs tail /aws/lambda/nasun-nft-verify-eligibility --follow

# register-user Lambda 로그
aws logs tail /aws/lambda/nasun-nft-register-user --follow

# export-csv Lambda 로그
aws logs tail /aws/lambda/nasun-nft-export-csv --follow
```

#### CloudWatch Alarms

**주요 알람**:
- Lambda 에러율 > 5%
- Lambda Throttle 발생
- DynamoDB Throttle 발생
- X API Rate Limit 초과 (429 에러)

### DynamoDB 데이터 조회

```bash
# 특정 지갑 주소 조회
aws dynamodb get-item \
  --table-name nasun-nft-whitelist \
  --key '{"walletAddress": {"S": "0x742d35cc6634c0532925a3b844bc9e7595f0beb7"}}' \
  --region ap-northeast-2

# 전체 화이트리스트 카운트
aws dynamodb scan \
  --table-name nasun-nft-whitelist \
  --select COUNT \
  --region ap-northeast-2
```

### IAM 권한

**Lambda 실행 역할 권한**:
```typescript
// verify-eligibility Lambda
whitelistTable.grantReadWriteData()
tasksTable.grantReadWriteData()

// register-user Lambda
whitelistTable.grantReadWriteData()
tasksTable.grantReadWriteData()

// export-csv Lambda
whitelistTable.grantReadData()
exportBucket.grantPut()
exportBucket.grantRead()
```

---

## 참고 문서

### 원본 문서 (복원됨)
- **WAVE1_BATTALION_NFT_EVENT_IMPLEMENTATION_PLAN.md** (4,976줄) - 상세 구현 계획서
- **NFT_EVENT_COMPLETION_HISTORY.md** (333줄) - 완료 히스토리
- **NFT_EVENT_MANUAL_E2E_TESTING_GUIDE.md** (604줄) - E2E 테스트 가이드

### 관련 문서
- **[BUILD_CONFIGURATION_GUIDE.md](./BUILD_CONFIGURATION_GUIDE.md)** - NftEventStack 빌드/배포 가이드
- **[NFT_EVENT_ENVIRONMENT_VARIABLES.md](./NFT_EVENT_ENVIRONMENT_VARIABLES.md)** - 환경 변수 참조

---

## 문서 정보

**통합 문서 버전**: v1.0.0
**원본 문서 버전**:
- WAVE1: v2.1
- COMPLETION_HISTORY: 최종 업데이트 2025-10-25
- TESTING_GUIDE: v1.0

**통합 일자**: 2025-10-29
**통합자**: Claude Code

**문서 통합 정보**:
- 원본 문서 3개를 1개로 통합
- 중복 내용 제거 (환경 변수 섹션, DynamoDB 테이블 스키마 등)
- 버그 수정 히스토리 통합
- E2E 테스트 가이드 핵심 내용 포함
- 배포 및 롤백 전략 통합

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
