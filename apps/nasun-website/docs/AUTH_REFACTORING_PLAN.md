# 인증(Auth) 기능 구조 개선 및 품질 고도화 계획

## 1. 현황 분석 및 문제점
현재 인증 관련 코드가 여러 경로에 파편화되어 있어 도메인 지식 파악이 어렵고, UI와 비즈니스 로직(인증 상태 관리)의 경계가 모호합니다.

### 개선이 필요한 파편화 경로:
1. `src/providers/auth/`: 전역 인증 상태 관리 (`AuthContext.tsx`)
2. `src/components/auth/`: 인증 UI 컴포넌트 (`MetaMaskLoginButton.tsx`)
3. `src/components/features/auth/`: OAuth 콜백 처리 (`Callback.tsx`)

## 2. 목표
인증 도메인을 `src/features/auth`로 통합하여 응집도를 높이고, 엄격한 **Public API(index.ts)** 설계를 통해 내부 구현 변경이 외부로 전파되지 않는 견고한 구조를 구축합니다.

## 3. 재구성 가이드라인 (Architecture)

### 디렉토리 구조:
- **`src/features/auth/`**
  - `components/`: UI 컴포넌트 (`Callback.tsx`, `LoginButton.tsx` 등)
  - `providers/`: Context Provider (`AuthProvider.tsx`)
  - `hooks/`: 비즈니스 로직 훅 (`useAuth.ts`, `useOAuth.ts` 등)
  - `types/`: 인증 관련 타입 정의
  - `utils/`: 인증 전용 유틸리티 (토큰 처리, 검증 로직)
  - `index.ts`: **Public API (진입점)**

### Public API 설계 원칙:
- **Export 허용**: `AuthProvider`, `useAuth` (필요 시 UI 컴포넌트 포함)
- **캡슐화**: 내부 Context 객체나 복잡한 유틸리티 로직은 외부에서 직접 참조하지 못하도록 숨김.

## 4. 상세 실행 단계 (Implementation)

### Phase 1: 구조 생성 및 코드 이동
1. **디렉토리 준비**: `src/features/auth/{components,providers,hooks,types}` 생성.
2. **로직 분리 및 이동**:
   - `AuthContext.tsx`에서 `useAuth` 훅 로직을 별도 파일(`hooks/useAuth.ts`)로 추출.
   - `AuthContext.tsx`는 `providers/AuthProvider.tsx`로 명칭 변경 및 이동.
   - UI 컴포넌트 이동 및 파일명 일관성 확보 (`MetaMaskLoginButton` -> `WalletLoginButton` 등 검토).

### Phase 2: 도메인 책임 경계 점검 (Quality Check)
1. **인터페이스 확인**: OAuth(Google/Twitter) 처리 로직과 Wallet 인증 로직이 상호 의존성을 가지는지 확인하고 인터페이스를 통해 분리.
2. **에러 핸들링**: 인증 실패 시 사용자 알림 로직이 UI에 직접 박혀있는지 확인 후 훅 레벨로 추상화.
3. **로딩 상태**: 전역 인증 초기화 중 레이아웃 시프트(CLS) 방지를 위한 로딩 상태 처리 점검.

### Phase 3: Public API 정의 및 경로 수정
1. **`index.ts` 작성**: 외부 노출 항목 결정.
   ```typescript
   export { AuthProvider } from './providers/AuthProvider';
   export { useAuth } from './hooks/useAuth';
   // UI가 필요한 경우만 export
   export { WalletLoginButton } from './components/WalletLoginButton';
   ```
2. **Import 경로 업데이트**:
   - 상대 경로(`../../..`) 대신 가능하면 Alias(`@features/auth`) 적용 권장.
   - 기존의 분산된 경로 참조를 모두 `src/features/auth`로 통합.

### Phase 4: 정리 및 검증
1. 비어있는 기존 폴더(`src/providers/auth` 등) 삭제.
2. 미사용 임포트 및 중복 로직 제거.

## 5. 테스트 및 검증 시나리오 (Verification)
리팩토링 완료 후 아래 시나리오를 반드시 수동 점검합니다.

- [ ] **소셜 로그인 플로우**: 구글/X 로그인 시 `/callback` 경로를 거쳐 정상적으로 세션이 생성되는가?
- [ ] **보호된 라우트(Protected Route)**: 로그인하지 않은 상태에서 `my-account` 접근 시 로그인 페이지로 리다이렉트 되는가?
- [ ] **세션 유지**: 페이지 새로고침 후에도 로그인 상태가 유지되는가?
- [ ] **로그아웃**: 로그아웃 시 로컬 스토리지/쿠키가 제거되고 상태가 초기화되는가?

## 6. 기대 효과
- **유지보수성**: 인증 로직 변경 시 `features/auth` 내부만 수정하면 됨.
- **가독성**: 신규 개발자가 프로젝트에 합류했을 때 인증 도메인의 위치와 진입점을 즉시 파악 가능.
- **안전성**: 엄격한 Export 제한으로 인해 의도치 않은 내부 로직 참조 방지.