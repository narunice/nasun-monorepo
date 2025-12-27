# Gensol Website 프로젝트 개선 계획서

## 개요
본 문서는 Gensol Website 프로젝트의 안정성, 보안성, 그리고 유지보수성을 향상시키기 위한 단계별 리팩토링 계획을 정의합니다. 아래 제안된 순서는 작업의 영향도와 의존성을 고려한 최적의 실행 순서입니다.

---

## Phase 1: 환경 변수 관리 체계화

- **목표:** 새로운 개발자가 프로젝트에 쉽게 참여할 수 있도록 환경 변수 설정 과정을 표준화하고, 설정 누락으로 인한 오류를 방지합니다.

### 상세 절차
1.  **`.env.example` 파일 생성:**
    `frontend` 디렉토리 내에 필요한 모든 환경 변수의 목록을 담은 예제 파일을 생성합니다. 실제 키 값은 비워둡니다.

2.  **`README.md` 업데이트:**
    프로젝트 설정 방법에 `.env.example` 파일을 `.env`로 복사하여 실제 값을 채워야 한다는 안내를 추가합니다.

### To-Do Checklist
- [x] `frontend/.env.example` 파일 생성
- [x] `awsConfig.ts` 파일을 참고하여 필요한 환경 변수 목록 추가
- [x] `frontend/README.md` 파일에 환경 변수 설정 안내 문구 추가

### 검증 방법
- 새로운 개발자가 `README.md` 안내와 `.env.example` 파일만으로 프로젝트 환경 설정을 문제없이 마칠 수 있는지 확인합니다.

---

## Phase 2: 코드 스타일 표준화 (Prettier 도입)

- **목표:** 모든 소스 코드에 일관된 코드 스타일을 강제하여 가독성을 높이고, 스타일 차이로 인한 잠재적 병합 충돌을 방지합니다.

### 상세 절차
1.  **Prettier 관련 패키지 설치:**
    `frontend` 디렉토리에서 아래 명령어를 실행하여 Prettier와 ESLint 연동 패키지를 설치합니다.
    ```bash
    pnpm add -D prettier eslint-config-prettier
    ```

2.  **`.prettierrc.cjs` 설정 파일 생성:**
    `frontend` 디렉토리에 Prettier 설정 파일을 생성하고 팀의 코드 스타일 규칙을 정의합니다. (예: `semi: true`, `singleQuote: false` 등)

3.  **ESLint 설정 업데이트:**
    `frontend/eslint.config.js` 파일의 `extends` 배열에 `prettier`를 추가하여 ESLint의 서식 규칙과 충돌하지 않도록 설정합니다.

4.  **`package.json` 스크립트 추가:**
    `package.json` 파일의 `scripts` 객체에 코드 포맷팅을 실행할 수 있는 명령어를 추가합니다.
    ```json
    "scripts": {
      ...
      "format": "prettier --write .",
      "format:check": "prettier --check ."
    }
    ```

### To-Do Checklist
- [x] `prettier`, `eslint-config-prettier` 패키지 설치
- [x] `frontend/.prettierrc.cjs` 파일 생성 및 규칙 정의
- [x] `frontend/eslint.config.js` 파일 수정
- [x] `frontend/package.json`에 `format`, `format:check` 스크립트 추가
- [x] `pnpm format` 명령을 실행하여 전체 프로젝트에 코드 스타일 적용

### 검증 방법
- `pnpm format:check` 실행 시 아무런 변경 사항이 감지되지 않는지 확인합니다.
- 여러 개발자가 작성한 코드의 스타일이 동일하게 유지되는지 확인합니다.

---

## Phase 3: 의존성 보안 감사 및 업데이트

- **목표:** 알려진 보안 취약점을 해결하여 프로젝트의 보안 수준을 높이고, 패키지를 최신 상태로 유지하여 안정성을 확보합니다.

### 상세 절차
1.  **취약점 확인:**
    `frontend` 디렉토리에서 `pnpm audit` 명령을 실행하여 현재 의존성의 취약점을 다시 확인합니다.

2.  **의존성 업데이트:**
    `pnpm up vite@latest` 명령을 실행하여 `vite` 관련 취약점을 해결합니다. 다른 취약점이 있다면 해당 패키지도 업데이트합니다.

3.  **정기적인 감사 프로세스 도입:**
    팀 내에서 주기적으로 (예: 매주 또는 매월) `pnpm audit`을 실행하고 결과를 공유하는 문화를 정착시킵니다.

### To-Do Checklist
- [x] `pnpm audit` 명령으로 취약점 확인
- [x] `pnpm up <package-name>` 명령으로 취약한 패키지 업데이트
- [x] 업데이트 후 `pnpm dev` 및 `pnpm build`가 정상적으로 동작하는지 확인

### 검증 방법
- `pnpm audit` 실행 시 더 이상 취약점이 보고되지 않는지 확인합니다.
- 애플리케이션이 업데이트된 의존성 하에서 정상적으로 실행되는지 확인합니다.

---

## Phase 4: 테스트 프레임워크 도입 (Vitest)

- **목표:** 자동화된 테스트를 도입하여 코드 변경에 대한 안정성을 확보하고, 리팩토링 시 발생할 수 있는 예기치 않은 버그를 사전에 방지합니다.

### 상세 절차
1.  **테스트 관련 패키지 설치:**
    `frontend` 디렉토리에서 아래 명령어를 실행하여 Vitest와 React Testing Library를 설치합니다.
    ```bash
    pnpm add -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
    ```

2.  **`vite.config.ts` 설정 추가:**
    `vite.config.ts` 파일에 Vitest가 동작할 수 있도록 테스트 관련 설정을 추가합니다. `defineConfig` 콜백 안에 `test` 속성을 추가해야 합니다.

3.  **테스트 스크립트 추가:**
    `package.json`의 `scripts`에 테스트 실행 명령어를 추가합니다.
    ```json
    "scripts": {
      ...
      "test": "vitest",
      "test:ui": "vitest --ui"
    }
    ```

4.  **첫 테스트 케이스 작성:**
    재사용 가능한 간단한 컴포넌트(예: `src/components/common/ExplorerLink.tsx`)에 대한 첫 테스트 파일(`ExplorerLink.test.tsx`)을 작성하여 컴포넌트가 정상적으로 렌더링되는지 확인하는 테스트를 추가합니다.

### To-Do Checklist
- [x] Vitest 및 React Testing Library 관련 패키지 설치
- [x] `vite.config.ts`에 테스트 설정 추가
- [x] `package.json`에 `test`, `test:ui` 스크립트 추가
- [x] 간단한 컴포넌트에 대한 첫 테스트 코드 작성
- [x] `pnpm test` 명령 실행 시 테스트가 성공적으로 통과하는지 확인

### 검증 방법
- `pnpm test` 명령이 오류 없이 실행되고, 작성된 테스트 케이스를 통과하는지 확인합니다.
- `pnpm test:ui` 실행 시 Vitest UI가 브라우저에 정상적으로 나타나는지 확인합니다.