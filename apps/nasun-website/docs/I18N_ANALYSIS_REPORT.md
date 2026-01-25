# Nasun Website 다국어 지원(i18n) 분석 보고서

Nasun Website는 `i18next` 생태계를 기반으로 표준적이고 모듈화된 다국어 지원 시스템을 갖추고 있습니다.

## 1. 사용 라이브러리
- **i18next**: 핵심 다국어 프레임워크.
- **react-i18next**: React 바인딩 (hooks, components 제공).
- **i18next-browser-languagedetector**: 브라우저 설정, 쿠키, 로컬 스토리지 등을 통한 언어 자동 감지.
- **i18next-http-backend**: 번역 파일 로딩 지원 (현재는 직접 import 방식 병행).

## 2. 핵심 설정 (`src/i18n.ts`)
모든 i18n 설정은 `src/i18n.ts` 파일에 집중되어 있습니다.
- **기본 언어(fallbackLng)**: `'en'` (영어가 기본값).
- **언어 감지 전략**: `querystring` -> `cookie` -> `localStorage` -> `navigator` -> `htmlTag` 순서로 언어를 결정합니다.
- **리소스 등록**: 번역 파일을 직접 `import`하여 `resources` 객체에 할당함으로써, 빌드 시 번역 데이터가 앱 번들에 포함됩니다.

## 3. 번역 파일 구조 (`src/assets/locales/`)
번역 데이터는 언어별 폴더와 기능별 '네임스페이스(Namespace)' JSON 파일로 나뉘어 관리됩니다.
- **경로**: `src/assets/locales/{en|ko}/`
- **주요 네임스페이스**:
  - `common.json`: 공통 UI 요소 (메뉴, 버튼 등).
  - `home.json`: 홈 페이지 텍스트.
  - `tokenomics.json`: 토크노믹스 관련 설명.
  - `governance.json`: 거버넌스 관련 텍스트.
- **특징**: 단일 거대 파일 대신 목적별로 분리하여 유지보수성을 높였습니다.

## 4. 컴포넌트 구현 패턴
- **`useTranslation` Hook**: 가장 일반적인 사용 방식입니다.
  ```typescript
  const { t } = useTranslation('common');
  return <button>{t('buttons.login')}</button>;
  ```
- **`<Trans>` Component**: HTML 태그나 변수가 포함된 복잡한 문장에 사용됩니다 (예: `UnifiedOnchain.tsx`).
- **HTML `lang` 속성**: 언어가 변경될 때마다 `<html>` 태그의 `lang` 어트리뷰트를 자동으로 업데이트하는 로직이 포함되어 있습니다.

## 5. 언어 전환 UI (`LanguageSwitcher.tsx`)
- **위치**: 네비게이션 바(`Navbar.tsx`) 우측 상단 유틸리티 영역.
- **로직**: 사용자가 드롭다운에서 언어를 선택하면 `i18n.changeLanguage(val)`를 호출하여 실시간으로 전체 앱의 언어를 전환합니다.

## 6. 지속성 및 상태 관리
- **저장소**: 사용자가 선택한 언어는 `localStorage` 및 `cookie`에 저장되어 재방문 시에도 유지됩니다.
- **URL 오버라이드**: `?lng=ko`와 같은 쿼리 스트링을 통해 강제로 특정 언어를 표시할 수 있습니다.
- **라우팅**: 현재 URL 경로(예: `/ko/home`)에 언어를 포함하는 방식은 사용하지 않습니다.

---

### 다국어 기능 최소화(Simplify)를 위한 제안 방향
만약 다국어 지원을 축소하거나 제거하고 싶다면 다음 단계를 고려할 수 있습니다:

1. **설정 단순화**: `src/i18n.ts`에서 언어 감지 로직을 제거하고 고정된 언어(`lng: 'en'`)만 사용하도록 수정.
2. **리소스 제거**: `ko` 폴더의 JSON 파일들을 삭제하고 `i18n.ts`에서 해당 import 구문 제거.
3. **UI 정리**: `Navbar`에서 `LanguageSwitcher` 컴포넌트 호출부 제거.
4. **코드 리팩토링**: 장기적으로 `useTranslation` 훅을 제거하고 텍스트를 직접 하드코딩하거나, 간단한 상수 객체로 대체.
