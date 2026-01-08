# 인증(Auth) 기능 구조 개선 및 통합 계획

## 1. 현황 분석
현재 `nasun-website` 프로젝트 내의 인증 관련 코드가 여러 경로에 파편화되어 있어 유지보수와 구조적 일관성이 떨어지는 상태입니다.

### 흩어져 있는 인증 관련 경로:
1. `src/providers/auth/`: 전역 인증 상태 관리 (`AuthContext.tsx`)
2. `src/components/auth/`: 인증 UI 컴포넌트 (`MetaMaskLoginButton.tsx`)
3. `src/components/features/auth/`: OAuth 콜백 처리 컴포넌트 (`Callback.tsx`)

## 2. 목표
인증 관련 로직과 컴포넌트를 도메인 중심의 `src/features/auth` 폴더로 통합하여 응집도를 높이고 구조를 단순화합니다.

## 3. 재구성 계획 (Refactoring Plan)

### 디렉토리 구조 변경:
- **새로운 경로**: `src/features/auth/`
  - `components/`: 인증 관련 UI 컴포넌트 (`Callback.tsx`, `MetaMaskLoginButton.tsx`)
  - `providers/`: 인증 Context Provider (`AuthContext.tsx`)
  - `hooks/`: (필요 시) 인증 관련 커스텀 훅 추출
  - `index.ts`: 외부 노출을 위한 진입점 (Public API)

### 상세 실행 단계:
1. **디렉토리 생성**: `src/features/auth/{components,providers}` 생성
2. **파일 이동**:
   - `src/providers/auth/AuthContext.tsx` -> `src/features/auth/providers/AuthContext.tsx`
   - `src/components/auth/MetaMaskLoginButton.tsx` -> `src/features/auth/components/MetaMaskLoginButton.tsx`
   - `src/components/features/auth/Callback.tsx` -> `src/features/auth/components/Callback.tsx`
3. **Public API 정의**: `src/features/auth/index.ts` 파일 생성 및 필요한 컴포넌트/훅 export
4. **가져오기 경로(Import Paths) 수정**:
   - 프로젝트 전역에서 `AuthContext`, `MetaMaskLoginButton`, `Callback`을 참조하는 경로 업데이트
   - 파일 이동에 따른 내부 상대 경로 (`../../utils/...` 등) 업데이트
5. **정리**: 비어있는 기존 폴더 삭제

## 4. 기대 효과
- **응집도 향상**: 인증과 관련된 모든 코드가 하나의 기능 단위(`feature/auth`)로 모여 파악이 쉬워짐
- **일관성 확보**: `src/features/wave1` 등 다른 기능들과 동일한 구조적 패턴 유지
- **불필요한 경로 제거**: 혼란을 줄 수 있는 `src/components/features/`와 같은 비표준 경로 제거

## 5. 불필요한 코드 확인 결과
- `components/features/auth` 경로는 구조적으로 중복되며 불필요한 레이어를 형성하고 있음
- 이동 과정에서 사용되지 않는 임포트나 중복 로직을 추가로 점검하여 제거 예정
