# useMetaMaskConnection Hook

**최종 업데이트**: 2025-11-12
**작성자**: Claude Code
**버전**: 1.0.0

## 개요

`useMetaMaskConnection`은 MetaMask 지갑 연결을 위한 통합 React Hook입니다. 신규 로그인(`login`)과 계정 연결(`link`) 두 가지 모드를 지원하며, 70%의 코드 중복을 제거하고 일관된 사용자 경험을 제공합니다.

## 주요 특징

- ✅ **두 가지 모드 지원**: `login` (신규 로그인) / `link` (계정 연결)
- ✅ **통합된 인증 플로우**: Challenge-Response 패턴 자동 처리
- ✅ **네트워크 자동 전환**: Sepolia/Mainnet 자동 감지 및 전환
- ✅ **프로필 자동 갱신**: link 모드에서 사용자 프로필 자동 업데이트
- ✅ **에러 핸들링**: onError 콜백으로 통합된 에러 처리
- ✅ **로딩 상태 관리**: isConnecting 상태 자동 제공

## 사용 위치

현재 이 Hook은 두 곳에서 사용됩니다:

1. **ConnectMetaMaskWallet** (`frontend/src/components/features/wallets/ConnectMetaMaskWallet.tsx`)
   - 위치: MY WALLET STATUS 섹션
   - 모드: `link` (기존 로그인 유지)

2. **UserInfo** (`frontend/src/components/app/myAccount/UserInfo.tsx`)
   - 위치: USER INFO 섹션
   - 모드: `link` (기존 로그인 유지)

## API

### Type Definitions

```typescript
export type MetaMaskConnectionMode = 'login' | 'link';

export interface UseMetaMaskConnectionOptions {
  mode: MetaMaskConnectionMode;
  onSuccess?: (address: string) => void;
  onError?: (error: Error) => void;
}

export interface UseMetaMaskConnectionReturn {
  handleConnect: () => Promise<void>;
  isConnecting: boolean;
}
```

### Parameters

- **mode** (`MetaMaskConnectionMode`, required)
  - `'login'`: 새로운 로그인 (AuthContext 업데이트)
  - `'link'`: 계정 연결 (기존 로그인 유지, link-account API 호출)

- **onSuccess** (`(address: string) => void`, optional)
  - 연결 성공 시 호출되는 콜백
  - 파라미터: `address` - 연결된 지갑 주소 (0x...)

- **onError** (`(error: Error) => void`, optional)
  - 연결 실패 시 호출되는 콜백
  - 파라미터: `error` - Error 객체

### Return Values

- **handleConnect** (`() => Promise<void>`)
  - MetaMask 연결을 시작하는 비동기 함수
  - 내부적으로 모든 인증 플로우를 처리

- **isConnecting** (`boolean`)
  - 현재 연결 진행 중인지 여부
  - 버튼 disabled 상태 관리에 사용

## 사용 예시

### 예시 1: 계정 연결 (Link Mode) - ConnectMetaMaskWallet

```tsx
import { useMetaMaskConnection } from '../../../hooks/wallet/useMetaMaskConnection';

export function ConnectMetaMaskWallet() {
  const { user } = useAuth();

  const { handleConnect, isConnecting } = useMetaMaskConnection({
    mode: 'link',
    onSuccess: (address) => {
      alert(`MetaMask wallet (${address.slice(0, 6)}...${address.slice(-4)}) linked successfully!`);
    },
    onError: (error) => {
      alert(error.message);
    },
  });

  const handleConnectWithCheck = async () => {
    if (!isMetaMaskInstalled()) {
      alert("MetaMask is not installed.");
      return;
    }
    if (!user) {
      alert("Please log in first.");
      return;
    }
    await handleConnect();
  };

  return (
    <Button
      onClick={handleConnectWithCheck}
      disabled={isConnecting || !user}
    >
      {isConnecting ? "Connecting..." : "Connect MetaMask"}
    </Button>
  );
}
```

### 예시 2: 계정 연결 (Link Mode) - UserInfo

```tsx
import { useMetaMaskConnection } from '../../../hooks/wallet/useMetaMaskConnection';

const UserInfo = ({ user }: UserInfoProps) => {
  const [linkError, setLinkError] = useState<string | null>(null);

  const { handleConnect: handleMetaMaskConnect, isConnecting: isMetaMaskConnecting } = useMetaMaskConnection({
    mode: 'link',
    onSuccess: (address) => {
      alert("MetaMask wallet linked successfully!");
    },
    onError: (error) => {
      if (error.message.includes("User denied")) {
        setLinkError("Signature request was rejected.");
      } else {
        setLinkError(error.message);
      }
    },
  });

  const handleLinkMetaMask = async () => {
    setLinkError(null);
    await handleMetaMaskConnect();
  };

  return (
    <Button onClick={handleLinkMetaMask} disabled={isMetaMaskConnecting}>
      {isMetaMaskConnecting ? "Connecting..." : "Link MetaMask Account"}
    </Button>
  );
};
```

### 예시 3: 신규 로그인 (Login Mode)

```tsx
import { useMetaMaskConnection } from '../hooks/wallet/useMetaMaskConnection';

export function MetaMaskLoginButton() {
  const { handleConnect, isConnecting } = useMetaMaskConnection({
    mode: 'login',
    onSuccess: (address) => {
      console.log('Logged in with:', address);
    },
    onError: (error) => {
      console.error('Login failed:', error);
    },
  });

  return (
    <Button
      onClick={handleConnect}
      disabled={isConnecting}
    >
      {isConnecting ? "Connecting..." : "Login with MetaMask"}
    </Button>
  );
}
```

## 내부 동작

### Link 모드 플로우

```
1. MetaMask 연결 (connectWallet)
2. 네트워크 확인 및 전환 (switchNetwork)
3. 백엔드 인증 (authenticateWithMetaMask - Challenge-Response)
4. link-account API 호출
   - Body: { primaryIdentityId, secondaryIdentityId, secondaryProvider }
5. 사용자 프로필 갱신 (fetch + updateUserProfile + localStorage)
6. onSuccess 콜백 실행
```

### Login 모드 플로우

```
1. MetaMask 연결 (connectWallet)
2. 네트워크 확인 및 전환 (switchNetwork)
3. 백엔드 인증 (authenticateWithMetaMask - Challenge-Response)
4. AuthContext 업데이트 (signInWithMetaMask)
5. onSuccess 콜백 실행
```

## 환경 변수

이 Hook은 다음 환경 변수를 사용합니다:

```bash
# MetaMask 네트워크 설정
VITE_ETHEREUM_CHAIN_ID=11155111        # Sepolia (dev) or 1 (prod)

# API 엔드포인트 (Link 모드 전용)
VITE_LINK_ACCOUNT_API=https://...      # link-account Lambda 엔드포인트
VITE_USER_PROFILE_API=https://...      # user-profile Lambda 엔드포인트
```

## 에러 처리

이 Hook은 다음과 같은 에러를 처리합니다:

1. **MetaMask 미설치**: onError 콜백으로 에러 전달
2. **네트워크 전환 실패**: 자동으로 switchNetwork 호출
3. **서명 거부**: "User denied" / "User rejected" 메시지
4. **link-account API 실패**: HTTP 에러 처리
5. **프로필 갱신 실패**: 에러 로그 및 onError 콜백 호출
6. **로그인 필요 (Link 모드)**: "User must be logged in" 에러

## 주의사항

1. **Link 모드 사용 시**: 반드시 사용자가 로그인된 상태여야 합니다.
2. **Pre-flight 체크**: MetaMask 설치 여부는 Hook 외부에서 체크하는 것을 권장합니다.
3. **에러 핸들링**: onError 콜백을 반드시 제공하여 에러를 적절히 처리하세요.
4. **로딩 상태**: isConnecting을 사용하여 버튼을 비활성화하세요.

## 기술 세부사항

### Dependencies

- `react` (useState)
- `@/features/auth` (useAuth, signInWithMetaMask)
- `../../store/userStore` (useUserStore, updateUserProfile)
- `../../utils/metamaskUtils` (connectWallet, switchNetwork, signMessage)
- `../../services/metamaskApi` (authenticateWithMetaMask)

### 코드 통계

- **파일**: `frontend/src/hooks/wallet/useMetaMaskConnection.ts`
- **줄 수**: 155줄
- **제거된 중복 코드**: 161줄 (85줄 + 76줄)
- **코드 재사용률**: 70%

## 관련 문서

- **구현 계획서**: `doc/METAMASK_CONNECTION_INTEGRATION_REPORT.md`
- **CLAUDE.md**: MetaMask integration 섹션
- **테스트 가이드**: 구현 계획서 Section 6 참조

## 변경 이력

### v1.0.0 (2025-11-12)
- 최초 생성
- ConnectMetaMaskWallet 리팩토링 완료
- UserInfo 리팩토링 완료
- Import 경로 버그 수정 (`stores` → `store`)

## 라이센스

이 Hook은 NASUN Website 프로젝트의 일부이며, 프로젝트 라이센스를 따릅니다.

---

**문의**: development@nasun.io
