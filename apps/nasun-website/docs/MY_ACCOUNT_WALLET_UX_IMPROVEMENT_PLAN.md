# My Account 지갑 관리 UX 개선 계획서

**작성일**: 2026-01-14
**상태**: Draft
**목표**: 파편화된 지갑 연결(Connect)과 계정 연동(Link) UI를 통합하여 2026년 Web3 트렌드에 부합하는 직관적인 UX 제공

---

## 1. 개요 및 배경

현재 `/my-account` 페이지는 **User Profile(계정 연동)** 섹션과 **Wallet Connections(세션 연결)** 섹션이 분리되어 있어 사용자에게 혼란을 주고 있습니다. 사용자는 "DB에 저장하는 Link"와 "브라우저에서 사용하는 Connect"의 기술적 차이를 이해할 필요가 없습니다.

본 계획서는 두 기능을 **"Connected Accounts"**라는 하나의 섹션으로 통합하고, 사용자의 지갑 상태(Status)에 따라 적절한 액션(Action)을 유도하는 **상태 기반 UI**로의 전환을 정의합니다.

---

## 2. 핵심 원칙 (2026 Web3 UX Standard)

1.  **지갑 = 아이덴티티**: 지갑은 단순한 도구가 아니라 로그인 수단이자 계정의 일부입니다.
2.  **단일 진실 공급원 (Single Source of Truth)**: 소셜 계정(Google, X)과 지갑(MetaMask, Nasun Wallet)을 구분하지 않고 하나의 리스트에서 관리합니다.
3.  **암시적 연결 (Implicit Connection)**: "Link(연동)"는 곧 "Connect(사용)"를 의미합니다. 연동 성공 시 자동으로 연결 상태가 되어야 합니다.
4.  **상태 중심 설계**: 버튼을 나열하는 것이 아니라, 현재 상태(활성/비활성/미연동)를 보여주고 필요한 액션만 버튼으로 노출합니다.

---

## 3. UI/UX 변경 명세

### 3.1. 섹션 구조 변경

*   **제거**: `Wallet Connections` 박스 및 하위 컴포넌트 (`WalletConnectionBar`)
*   **통합**: `User Profile` 박스를 **"Connected Accounts"**로 확장 및 개편

### 3.2. 통합된 Connected Accounts UI 레이아웃

모든 인증 수단(소셜, 지갑)을 테이블 또는 리스트 형태로 일원화합니다.

| Provider | Account Info | Status (Badge + Text) | Primary Action |
| :--- | :--- | :--- | :--- |
| **X (Twitter)** | @Naru010110 | <span style="color:green">● Logged in</span> | `[Unlink]` |
| **Google** | naru@... | <span style="color:gray">Linked</span> | `[Switch]` `[Unlink]` |
| **MetaMask** | 0x12...ab34 | <span style="color:green">● Active wallet</span> | `[Unlink]` |
| **Nasun Wallet**| (Not linked) | - | `[Link]` |

> **Note**: 기존 'Sui Wallet' 명칭은 나선 네트워크 환경에 맞춰 **'Nasun Wallet'**으로 통일합니다.

---

## 4. 메타마스크 상태별 동작 로직 (State Machine)

메타마스크의 상태는 크게 4가지로 분류되며, 각 상태에 따라 UI와 동작이 결정됩니다.

### 상태 ①: ❌ Not Linked (미연동)
*   **상황**: 사용자의 `linkedAccounts`에 메타마스크 정보가 없음.
*   **UI**: `[ Link wallet ]` 버튼 노출
*   **동작 (One-Click Flow)**:
    1.  사용자 클릭
    2.  메타마스크 서명 요청
    3.  백엔드 API 호출 (`link-account`) → DB 저장
    4.  **성공 즉시 프론트엔드 `connect()` 호출** → 세션 활성화
    5.  UI 상태가 `Active wallet`으로 변경

### 상태 ②: 🟢 Active Wallet (정상 사용 중)
*   **상황**: DB에 등록된 주소와 현재 브라우저(MetaMask Extension)에 활성화된 주소가 **일치함**.
*   **UI**: `<Badge>● Active wallet</Badge>` + `[ Unlink ]` 버튼
*   **동작**: 별도 연결 버튼 없음. 이미 사용 가능함.

### 상태 ③: 🟡 Linked, but Inactive (연동됨, 비활성)
*   **상황**: DB에는 등록되어 있으나, 브라우저 지갑이 연결되지 않았거나 잠겨 있음.
*   **UI**: `Linked (not active)` 텍스트 + `[ Activate ]` 버튼
*   **동작**:
    1.  사용자가 `Activate` 클릭
    2.  `eth_requestAccounts` 호출
    3.  주소가 일치하면 `Active wallet` 상태로 전환

### 상태 ④: ⚠️ Different Wallet Active (다른 지갑 활성)
*   **상황**: DB에는 `0xAAAA...`가 등록되어 있는데, 브라우저 메타마스크는 `0xBBBB...`로 연결됨.
*   **UI**: 
    *   리스트: `Linked (0xAAAA...)` + `[ Switch to this ]`
    *   **상단 알림 배너 (선택 사항)**: "새로운 지갑(0xBBBB...)이 감지되었습니다. 이 지갑을 계정에 연결하시겠습니까?" `[ Link this wallet ]`
*   **동작**:
    *   `Switch` 클릭 시: 메타마스크에 해당 계정으로 변경 요청 유도 (또는 사용자에게 변경 안내)
    *   `Link this` 클릭 시: `0xBBBB...`를 추가로 연동 (Multi-wallet 지원 시) 또는 교체

---

## 5. 구현 가이드

### 5.1. 컴포넌트 수정 (`apps/nasun-website/frontend/src/components/app/myAccount`)

1.  **`ProfileHeroCard.tsx` (개편)**:
    *   이름을 `ConnectedAccountsCard` 등으로 변경 고려 (선택 사항).
    *   기존 `SocialIcons` 및 `SocialAccountItem`을 확장하여 지갑 로직 포함.
    *   Nasun Wallet (Sui 기반)과 MetaMask 로직을 통합 렌더링.

2.  **`WalletConnectionBar.tsx` (삭제)**:
    *   해당 컴포넌트 삭제 및 `MyAccountPage.tsx`에서 제거.

### 5.2. 훅(Hook) 로직 개선

**`useMetaMaskConnection.ts` 수정**:
Link 모드 성공 시, 단순히 성공 메시지만 띄우는 것이 아니라 **연결(Connect)**까지 연쇄적으로 수행하도록 변경합니다.

```typescript
// Pseudo Code
const handleLinkMetaMask = async () => {
  // 1. 서명 및 DB 연동 (기존 로직)
  await signAndLink();
  
  // 2. [NEW] 즉시 활성화 (UX 개선)
  // useAuth 또는 useWallet 훅의 connect 함수 호출
  await wallet.connect(); 
  
  toast.success("MetaMask linked and activated!");
};
```

### 5.3. 텍스트(Copywriting) 가이드

사용자가 기술적 용어보다 **상태**를 이해하기 쉽도록 텍스트를 구성합니다.

| 기존 | 변경 (제안) |
| :--- | :--- |
| Connect | **Activate** (활성화) |
| Link | **Link wallet** (지갑 등록) |
| (연결 상태) | **● Active wallet** |
| (미연결 상태) | **Wallet not linked** |

---

## 6. 기대 효과

1.  **직관성**: 사용자는 "내 계정에 지갑을 등록한다"는 하나의 멘탈 모델만 가지면 됩니다.
2.  **효율성**: Link와 Connect가 한 번의 클릭으로 처리되어 불필요한 단계를 제거합니다.
3.  **확장성**: 추후 다른 지갑이나 소셜 로그인 수단이 추가되더라도 동일한 테이블 구조 내에서 일관되게 관리할 수 있습니다.
4.  **모바일 최적화**: 두 개의 박스를 하나로 통합하여 모바일 화면 공간을 절약합니다.
