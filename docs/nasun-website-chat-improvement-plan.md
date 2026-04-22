# Nasun Website Chat & MyAccount Improvement Plan

## 1. 개요
최근 나선 웹사이트(`nasun-website`)의 'My Account' 페이지에서 채팅창 사용 시 발생하는 브라우저 콘솔 에러 및 성능 저하 현상을 분석하고, 시스템의 안정성과 사용자 경험을 향상시키기 위한 개선 계획을 제안합니다.

## 2. 현상 분석 (Console Log 기반)

### 2.1. 트위터 프로필 이미지 404 에러
*   **에러 내용:** `GET https://pbs.twimg.com/profile_images/... 404 (Not Found)`
*   **원인:** 과거에 연동된 트위터 프로필 이미지 URL이 만료되었으나 DB에는 여전히 해당 주소가 남아있음. 채팅창 로딩 시 수십 개의 메시지가 로드되며 각 메시지마다 개별적인 404 요청이 발생하여 네트워크 노이즈를 유발함.
*   **현재 상태:** `ChatAvatar` 컴포넌트에서 폴백(boring-avatars) 처리가 되어 있어 UI는 깨지지 않으나, 브라우저 콘솔에 에러 기록은 지속됨.

### 2.2. 지갑 확장 프로그램 충돌 (Wallet Provider Conflict)
*   **에러 내용:** `TypeError: Cannot set property ethereum of #<Window> which has only a getter`
*   **원인:** 메타마스크와 다른 지갑(Phantom, 브라우저 내장 지갑 등)이 동시에 설치된 환경에서 `window.ethereum` 객체 점유권 충돌 발생.
*   **영향:** 채팅 인증을 위한 서명 요청 시 지갑 응답이 느려지거나 간헐적으로 실패할 가능성 있음.

### 2.3. Cloudflare Turnstile 권한 경고
*   **에러 내용:** `[Violation] Permissions policy violation: xr-spatial-tracking is not allowed in this document.`
*   **원인:** 채팅 인증용 봇 방어 도구(Turnstile) 스크립트가 로드되면서 문서에 허용되지 않은 권한을 체크하려 함.
*   **영향:** 기능상 문제는 없으나 불필요한 로그 발생.

### 2.4. 성능 저하 및 과도한 리렌더링
*   **현상:** 채팅창을 열거나 메시지가 수신될 때 방대한 양의 스택 트래이스가 콘솔에 출력됨.
*   **원인:** `MyAccountPage`와 `ChatWidget` 간의 상태 공유 로직에서 의존성 관리 부실로 인해 불필요한 리렌더링이 전파됨.

---

## 3. 개선 계획

### 3.1. UI/UX: 아바타 이미지 로딩 최적화
*   **전역 이미지 블랙리스트 도입:** 404가 확인된 이미지 URL을 클라이언트 메모리에 `Set`으로 저장.
*   **사전 차단:** `ChatAvatar` 렌더링 전 블랙리스트에 있는 URL이면 즉시 폴백 아바타를 렌더링하여 불필요한 네트워크 요청(`GET`)을 원천 차단.
*   **이미지 컴포넌트 메모이제이션:** `ChatAvatar`를 `React.memo`로 감싸 부모 리렌더링 시 이미지 리로딩 방지.

### 3.2. 성능: 렌더링 및 상태 관리 최적화
*   **메시지 리스트 가상화 (Virtual Scrolling):** 메시지 개수가 많아질 경우(예: 100개 이상) 실제 뷰포트 내에 보이는 메시지만 렌더링하여 DOM 노드 수 유지.
*   **컴포넌트 분리:** `ChatWidget`의 드래그/리사이즈 상태와 메시지 리스트 상태를 분리하여, 리사이징 중에는 메시지 리스트가 리렌더링되지 않도록 함.
*   **Turnstile 로딩 시점 조절:** 채팅창이 열린 상태(isOpen=true)에서만 Turnstile 스크립트가 로드되도록 지연 로딩 적용.

### 3.3. 안정성: 지갑 연동 로직 개선 (@nasun/wallet)
*   **EIP-6963 지원:** `window.ethereum` 직접 접근 대신 `announcement` 이벤트를 통해 여러 프로바이더를 감지하고, 사용자가 선택한 지갑 프로바이더를 명확히 호출하도록 로직 개선.
*   **Provider Discovery:** 충돌 발생 시 사용자에게 "다른 지갑 확장 프로그램이 감지되었습니다"와 같은 안내 문구 노출 고려.

### 3.4. 보안: Cloudflare 정책 대응
*   **Feature-Policy/Permissions-Policy 설정:** 서버(Nginx 또는 Cloudflare 설정)에서 필요한 권한을 명시적으로 선언하여 브라우저 경고 최소화.

---

## 4. 실행 로드맵 (추천 작업 순서)

1.  **Phase 1 (Quick Fix):**
    *   `ChatAvatar` 메모이제이션 및 404 URL 블랙리스트 필터링 구현.
    *   채팅 메시지 아이템(`MessageItem`) 컴포넌트 분리 및 `React.memo` 적용.
2.  **Phase 2 (Performance):**
    *   `MyAccountPage` 리디자인 구조에서 채팅 위젯의 상태 의존성 분리 (Context API 최적화).
    *   메시지 리스트 가상 스크롤 라이브러리(예: `react-virtuoso` 등) 도입 검토.
3.  **Phase 3 (Stability):**
    *   `@nasun/wallet` 패키지에 EIP-6963 표준 적용 및 지갑 감지 로직 고도화.

---

## 5. 결론
현재 발생하는 이슈들은 서비스 가용성에 직접적인 영향을 주지는 않으나, 네트워크 리소스 낭비와 클라이언트 성능 저하를 유발하고 있습니다. 제안된 개선 계획에 따라 순차적으로 최적화를 진행한다면 더욱 쾌적하고 신뢰할 수 있는 사용자 경험을 제공할 수 있을 것입니다.
