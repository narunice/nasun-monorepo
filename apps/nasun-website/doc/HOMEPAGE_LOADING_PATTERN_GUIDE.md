# HomePage Loading Pattern Guide

**작성일**: 2025-11-08
**버전**: 1.0.0
**작성자**: Claude Code

다른 페이지 구현 시 참고할 수 있는 HomePage의 로딩 패턴 가이드입니다.

---

## 📋 목차

1. [문제 정의](#문제-정의)
2. [해결 방안](#해결-방안)
3. [구현 패턴](#구현-패턴)
4. [코드 예시](#코드-예시)
5. [적용 시나리오](#적용-시나리오)
6. [주의사항](#주의사항)
7. [관련 문서](#관련-문서)
8. [추가 이슈: Footer 타이밍 문제](#추가-이슈-footer-타이밍-문제-2025-12-28-추가) ⭐ NEW
9. [새로운 비디오 Hero 페이지 추가 체크리스트](#새로운-비디오-hero-페이지-추가-체크리스트) ⭐ NEW
10. [현재 비디오 Hero 페이지 목록](#현재-비디오-hero-페이지-목록)
11. [디버깅 팁](#디버깅-팁)

---

## 문제 정의

### 증상: 다중 로딩 스핀 현상

홈페이지 접속 시 로딩 스핀이 **여러 번** 순차적으로 나타나는 문제:

1. **로딩 스핀 #1**: 브라우저 중앙 큰 원형 스핀 (HeroSection 비디오 로딩)
2. **로딩 스핀 #2**: 네비바 아래 작은 원형 스핀 (Suspense fallback, 매우 짧음)
3. **로딩 스핀 #3**: 브라우저 중앙 큰 원형 스핀 (HeroSection 재렌더링) ❌

### 근본 원인

**조건부 렌더링에 의한 컴포넌트 재마운트**:

```tsx
// ❌ 문제가 있는 패턴
if (!isVideoReady) {
  return (
    <div className="fixed inset-0">
      <HeroSection onVideoReady={handleVideoReady} />  // 1차 마운트
    </div>
  );
}

return (
  <ScrollSnapContainer>
    <HeroSection onVideoReady={handleVideoReady} />    // 2차 마운트 (상태 초기화!)
  </ScrollSnapContainer>
);
```

**타임라인**:
```
T0: HeroSection 1차 렌더링 (fixed position)
  ↓
T1: 비디오 로드 완료 → setIsVideoPlaying(true) → 로딩 스핀 사라짐
  ↓
T2: setIsVideoReady(true) 트리거
  ↓
T3: HomePage 재렌더링 (조건부 렌더링 경로 변경)
  ↓
T4: HeroSection 2차 렌더링 (ScrollSnapContainer 내부)
  └─ isVideoPlaying 상태 초기화! (false)
  └─ 로딩 스핀 다시 표시 ❌
```

---

## 해결 방안

### Option 1: Context로 상태 이동 (비권장)
- HeroSection의 상태를 Context로 이동하여 유지
- 복잡도 증가, Context 오버엔지니어링

### Option 2: CSS 기반 위치 제어 (✅ 권장)
- 조건부 렌더링 제거
- CSS만으로 위치 전환 (fixed ↔ relative)
- 컴포넌트가 한 번만 마운트되므로 상태 유지

### Option 3: Suspense fallback null (보조)
- 불필요한 중간 로딩 스핀 제거
- Option 2와 함께 사용

---

## 구현 패턴

### 패턴: CSS 기반 위치 제어 (Single Mount Pattern)

**핵심 원칙**:
1. 컴포넌트를 항상 렌더링 (조건부 return 제거)
2. Props로 상태를 전달받아 CSS 클래스 동적 변경
3. React 상태 초기화 방지

**적용 단계**:

#### Step 1: 부모 컴포넌트 (Page) 수정

```tsx
// ❌ Before: 조건부 렌더링
if (!isReady) {
  return (
    <div className="fixed inset-0">
      <MySection onReady={handleReady} />
    </div>
  );
}

return (
  <ScrollSnapContainer>
    <MySection onReady={handleReady} />
  </ScrollSnapContainer>
);

// ✅ After: 항상 렌더링 + CSS 제어
return (
  <ScrollSnapContainer>
    <MySection onReady={handleReady} isReady={isReady} />
  </ScrollSnapContainer>
);
```

#### Step 2: 자식 컴포넌트 (Section) 수정

```tsx
// Props 인터페이스 확장
interface MySectionProps {
  onReady?: () => void;
  isReady?: boolean;  // ← 추가
}

function MySection({ onReady, isReady = false }: MySectionProps) {
  // CSS 기반 위치 제어
  const containerClassName = !isReady
    ? "fixed inset-0 z-40 bg-nasun-white dark:bg-nasun-black h-screen overflow-hidden flex items-center justify-center"
    : "w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] h-screen overflow-hidden flex items-center justify-center";

  return (
    <div className={containerClassName}>
      {/* 컨텐츠 */}
    </div>
  );
}
```

#### Step 3: Suspense fallback 최적화

```tsx
// ✅ 불필요한 로딩 스핀 제거
const suspenseFallback = null;

<Suspense fallback={suspenseFallback}>
  {/* Lazy-loaded components */}
</Suspense>
```

---

## 코드 예시

### 실제 구현: HomePage + HeroSection

#### HomePage.tsx

```tsx
import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { ScrollSnapContainer } from "../components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "../components/layout/ScrollSnapSection";
import { useHomePageLoading } from "../contexts/PageLoadingContext";

const HeroSection = lazy(() => import("../components/app/home/HeroSection"));
const VisionSection = lazy(() => import("../components/app/home/VisionSection"));
const AwardsGrantsSection = lazy(() => import("../components/app/home/AwardsGrantsSection"));

export default function HomePage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = useHomePageLoading();

  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    // Preload critical sections before showing footer
    await Promise.all([
      import("../components/app/home/VisionSection"),
      import("../components/app/home/AwardsGrantsSection"),
    ]);

    setIsPageReady(true);
  }, [setIsPageReady]);

  // Body 스크롤 제어
  useEffect(() => {
    if (!isVideoReady) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isVideoReady]);

  // Suspense fallback: null to prevent unnecessary loading spinners
  const suspenseFallback = null;

  // HeroSection is always rendered, using CSS-based positioning
  return (
    <ScrollSnapContainer>
      <ErrorBoundary fallback={errorFallback}>
        <Suspense fallback={suspenseFallback}>
          {/* HeroSection: CSS 기반 위치 제어 */}
          <ScrollSnapSection>
            <HeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
          </ScrollSnapSection>

          {/* VisionSection */}
          <ScrollSnapSection>
            <VisionSection />
          </ScrollSnapSection>

          {/* AwardsGrantsSection */}
          <ScrollSnapSection allowTallContent={true}>
            <AwardsGrantsSection />
          </ScrollSnapSection>
        </Suspense>
      </ErrorBoundary>
    </ScrollSnapContainer>
  );
}
```

#### HeroSection.tsx

```tsx
import React, { useState, useEffect } from "react";
import heroVideoPcMP4 from "../../../assets/videos/Full-Trailer-02-rf23.mp4";
import heroVideoMobileMP4 from "../../../assets/videos/Full-Trailer-02-rf27.mp4";

interface HeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;  // ← CSS 제어용 prop
}

function HeroSection({ onVideoReady, isVideoReady = false }: HeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 비디오 로딩 핸들러
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

  // 디바이스에 따라 비디오 소스 선택
  const videoSrc = isMobile ? heroVideoMobileMP4 : heroVideoPcMP4;

  // CSS 기반 위치 제어
  const containerClassName = !isVideoReady
    ? "fixed inset-0 z-40 bg-nasun-white dark:bg-nasun-black h-screen overflow-hidden flex items-center justify-center"
    : "w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] h-screen overflow-hidden flex items-center justify-center";

  return (
    <div className={containerClassName}>
      <video
        key={videoSrc}
        autoPlay
        loop
        muted
        playsInline
        className="w-full max-w-none h-full object-cover"
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
      >
        <source src={videoSrc} type="video/mp4" />
      </video>

      {/* 로딩 오버레이 - 비디오 재생 전까지 표시 */}
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 border-4 border-nasun-white/20 border-t-nasun-white rounded-full animate-spin"></div>
            <p className="text-nasun-white/60 text-sm">Loading...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(HeroSection);
```

---

## 적용 시나리오

### 시나리오 1: 비디오/이미지 로딩이 필요한 Hero Section

**사용 사례**:
- 홈페이지 인트로 비디오
- 제품 소개 페이지 Hero 이미지
- 갤러리 페이지 초기 로딩

**적용 방법**: 위의 HomePage + HeroSection 패턴 그대로 적용

---

### 시나리오 2: 데이터 Fetch가 필요한 페이지

**사용 사례**:
- 리더보드 페이지 (API 데이터 로딩)
- 블로그 포스트 목록
- 사용자 프로필 페이지

**적용 방법**:

```tsx
function DataPage() {
  const [isDataReady, setIsDataReady] = useState(false);
  const { data, isLoading } = useQuery(["myData"], fetchData);

  useEffect(() => {
    if (!isLoading && data) {
      setIsDataReady(true);
    }
  }, [isLoading, data]);

  return (
    <Suspense fallback={null}>
      <DataSection isDataReady={isDataReady} data={data} />
    </Suspense>
  );
}

function DataSection({ isDataReady, data }: DataSectionProps) {
  const containerClassName = !isDataReady
    ? "fixed inset-0 z-40 flex items-center justify-center"
    : "container mx-auto px-4";

  return (
    <div className={containerClassName}>
      {!isDataReady ? (
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
      ) : (
        <DataContent data={data} />
      )}
    </div>
  );
}
```

---

### 시나리오 3: 인증 확인이 필요한 보호된 페이지

**사용 사례**:
- My Account 페이지
- 관리자 대시보드
- 사용자 설정 페이지

**적용 방법**:

```tsx
function ProtectedPage() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      setIsAuthReady(true);
    }
  }, [isLoading]);

  return (
    <Suspense fallback={null}>
      <ProtectedSection isAuthReady={isAuthReady} user={user} />
    </Suspense>
  );
}

function ProtectedSection({ isAuthReady, user }: ProtectedSectionProps) {
  const containerClassName = !isAuthReady
    ? "fixed inset-0 z-40 flex items-center justify-center"
    : "container mx-auto px-4";

  return (
    <div className={containerClassName}>
      {!isAuthReady ? (
        <PageLoading message="Authenticating..." />
      ) : user ? (
        <UserContent user={user} />
      ) : (
        <Navigate to="/login" />
      )}
    </div>
  );
}
```

---

## 주의사항

### ⚠️ 1. React.memo 사용 권장

컴포넌트가 불필요하게 재렌더링되는 것을 방지하기 위해 `React.memo`로 감싸세요:

```tsx
export default React.memo(HeroSection);
```

### ⚠️ 2. Props 의존성 최소화

`isVideoReady` 같은 단순 boolean만 props로 전달하세요. 복잡한 객체를 전달하면 React.memo가 무용지물이 됩니다.

```tsx
// ✅ Good
<HeroSection isVideoReady={isVideoReady} />

// ❌ Bad
<HeroSection config={{ isVideoReady, otherStuff: {} }} />
```

### ⚠️ 3. CSS 클래스 충돌 주의

`fixed` ↔ `relative` 전환 시 다른 CSS 속성도 함께 변경해야 할 수 있습니다:

```tsx
// 예시: z-index, background, overflow 등 함께 제어
const containerClassName = !isReady
  ? "fixed inset-0 z-40 bg-nasun-white dark:bg-nasun-black overflow-hidden"
  : "relative w-full h-screen overflow-auto";
```

### ⚠️ 4. Suspense fallback null 사용 시점

**사용해야 할 때**:
- 로딩 상태를 자식 컴포넌트 내부에서 관리하는 경우
- 중간 로딩 스핀이 불필요한 경우

**사용하지 말아야 할 때**:
- 로딩 시간이 길어질 수 있는 경우 (사용자 혼란)
- 데이터 fetch가 실패할 가능성이 높은 경우

---

## 관련 문서

### 내부 문서
- [LOADING_COMPONENT_UNIFICATION.md](LOADING_COMPONENT_UNIFICATION.md) - 로딩 컴포넌트 통일화 작업 (2025-11-08)
- [REFACTORING_LOADING_COMPONENT_PLAN.md](REFACTORING_LOADING_COMPONENT_PLAN.md) - 로딩 컴포넌트 리팩토링 계획

### 로딩 컴포넌트
- `frontend/src/components/common/SectionLoading.tsx` - Suspense fallback용
- `frontend/src/components/common/InlineLoading.tsx` - 버튼/인라인용 (sm/md/lg)
- `frontend/src/components/common/PageLoading.tsx` - 전체 페이지용

### Git 커밋
- `7ba86ff` - fix(HomePage): Prevent footer appearing before hero section content
- `2a1a389` - refactor(HomePage): Eliminate multiple loading spinners by preventing HeroSection re-mount

---

## 요약

### ✅ 핵심 원칙

1. **조건부 렌더링 대신 CSS 제어 사용**: 컴포넌트 재마운트 방지
2. **Suspense fallback 최소화**: 불필요한 중간 로딩 제거
3. **Props로 상태 전달**: 부모 → 자식으로 상태 흐름 명확화
4. **React.memo 활용**: 불필요한 재렌더링 방지

### 🎯 기대 효과

- 로딩 스핀이 한 번만 표시
- 상태 초기화 문제 해결
- 더 나은 성능 (재렌더링 감소)
- 깔끔한 사용자 경험

---

## 추가 이슈: Footer 타이밍 문제 (2025-12-28 추가)

### 문제 현상

다른 페이지에서 비디오 hero 페이지로 이동할 때:
1. 이전 페이지의 `isPageReady = true` 상태가 유지됨
2. Footer가 잠깐 보였다가 사라짐
3. 그 후에 비디오 로딩 스피너가 표시됨

### 원인

React의 `useEffect`는 **비동기**로 실행됩니다:
- 경로 변경 → 렌더링 → useEffect 실행 (타이밍 갭 존재)
- 이 갭 동안 이전 상태(`isPageReady = true`)가 유지됨

### 해결: useLayoutEffect 사용

`useLayoutEffect`는 브라우저가 화면을 그리기 **전**에 동기적으로 실행됩니다.

**파일**: `frontend/src/contexts/PageLoadingContext.tsx`

```tsx
import { useLayoutEffect } from "react";

// useEffect 대신 useLayoutEffect 사용
useLayoutEffect(() => {
  const isPageWithVideoHero =
    location.pathname === "/" ||
    location.pathname === "/home" ||
    location.pathname === "/protocol/network" ||
    location.pathname.startsWith("/finance/pado") ||  // 하위 경로 포함
    location.pathname === "/wave1/battalion-nft";

  if (isPageWithVideoHero) {
    clearTimer();
    setIsPageReady(false);  // 즉시 Footer 숨김
  } else {
    // 다른 페이지: 1000ms 후 Footer 표시
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsPageReady(true);
    }, 1000);
  }
}, [location.pathname, clearTimer]);
```

### 해결: requestAnimationFrame 이중 호출

비디오 로딩 완료 후 Footer를 표시할 때, DOM이 완전히 렌더링될 때까지 대기:

```tsx
const handleVideoReady = useCallback(async () => {
  setIsVideoReady(true);

  // 섹션 프리로드
  await Promise.all([
    import("../../components/app/finance/pado/PadoOverviewSection"),
    // ...
  ]);

  // ✅ requestAnimationFrame 이중 호출로 DOM 렌더링 완료 보장
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setIsPageReady(true);  // Footer 표시
    });
  });
}, [setIsPageReady]);
```

**이유**: 첫 번째 rAF는 현재 프레임 완료를, 두 번째 rAF는 다음 프레임 시작을 기다립니다.

---

## 새로운 비디오 Hero 페이지 추가 체크리스트

### Step 1: PageLoadingContext에 경로 추가

**파일**: `frontend/src/contexts/PageLoadingContext.tsx`

```tsx
const isPageWithVideoHero =
  location.pathname === "/" ||
  location.pathname === "/home" ||
  location.pathname === "/protocol/network" ||
  location.pathname.startsWith("/finance/pado") ||
  location.pathname === "/wave1/battalion-nft" ||
  location.pathname === "/your/new/path";  // ← 추가
```

> 하위 경로가 있는 경우 `startsWith()` 사용

### Step 2: 페이지 컴포넌트 구현

```tsx
import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { usePageLoading } from "../../contexts/PageLoadingContext";

const MyHeroSection = lazy(() => import("../../components/app/MyHeroSection"));
const ContentSection = lazy(() => import("../../components/app/ContentSection"));

export default function MyPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  // 1. 페이지 마운트 시 Footer 숨김
  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  // 2. 비디오 로딩 완료 핸들러
  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    // 3. 다음 섹션 프리로드
    await Promise.all([
      import("../../components/app/ContentSection"),
    ]);

    // 4. requestAnimationFrame 이중 호출
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  // 5. 비디오 로딩 중 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = isVideoReady ? "auto" : "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isVideoReady]);

  return (
    <ErrorBoundary fallback={<p>Failed to load</p>}>
      <Suspense fallback={null}>
        {/* Hero Section - CSS 기반 위치 제어 */}
        <MyHeroSection
          onVideoReady={handleVideoReady}
          isVideoReady={isVideoReady}
        />

        {/* 6. 조건부 렌더링으로 레이아웃 시프트 방지 */}
        {isVideoReady && (
          <>
            <ContentSection />
          </>
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Step 3: Hero Section 컴포넌트 구현

```tsx
interface MyHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

function MyHeroSection({ onVideoReady, isVideoReady }: MyHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // 1. onCanPlay - 비디오 재생 가능
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  // 2. onPlaying - 비디오 재생 시작 (fallback)
  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
    // onCanPlay가 실패해도 onPlaying에서 처리
    if (!isVideoLoaded) {
      setIsVideoLoaded(true);
      onVideoReady?.();
    }
  };

  // 3. Timeout fallback - 5초 후 강제 표시
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isVideoLoaded) {
        setIsVideoLoaded(true);
        setIsVideoPlaying(true);
        onVideoReady?.();
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [isVideoLoaded, onVideoReady]);

  // 4. CSS 기반 위치 제어
  const containerClassName = !isVideoReady
    ? "fixed inset-0 z-40 bg-nasun-black h-screen"
    : "relative !p-0";

  return (
    <SectionLayout className={containerClassName}>
      {/* 로딩 스피너 */}
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}

      {/* 비디오 - poster 이미지 필수 */}
      <video
        poster={posterImage}
        autoPlay
        loop
        muted
        playsInline
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
        className={`w-full h-full ${!isVideoPlaying ? "opacity-0" : "opacity-100"} transition-opacity duration-500`}
      >
        <source src={videoSource} type="video/mp4" />
      </video>
    </SectionLayout>
  );
}

export default React.memo(MyHeroSection);
```

### Step 4: 포스터 이미지 생성 (권장)

비디오 첫 프레임을 포스터로 추출:

```bash
# 데스크톱 포스터
ffmpeg -i your-video.mp4 -vframes 1 -q:v 2 your-video-poster.jpg

# 모바일 포스터 (별도 비디오가 있는 경우)
ffmpeg -i your-video-mobile.mp4 -vframes 1 -q:v 2 your-video-poster-mobile.jpg
```

---

## 현재 비디오 Hero 페이지 목록

| 페이지 | 경로 | 체크 방식 | 파일 |
|--------|------|-----------|------|
| HomePage | `/`, `/home` | 정확히 일치 | `pages/HomePage.tsx` |
| NetworkPage | `/protocol/network` | 정확히 일치 | `pages/protocol/NetworkPage.tsx` |
| PadoPage | `/finance/pado/*` | startsWith | `pages/finance/PadoPage.tsx` |
| BattalionNftPage | `/wave1/battalion-nft` | 정확히 일치 | `pages/wave1/BattalionNftPage.tsx` |

---

## 디버깅 팁

### 문제: Footer가 잠깐 보임
- PageLoadingContext에 경로가 등록되어 있는지 확인
- 하위 경로인 경우 `startsWith()` 사용했는지 확인

### 문제: 비디오가 재생되지만 스크롤 안 됨
- `handleVideoPlaying()`에서 `onVideoReady()` 호출하는지 확인
- Timeout fallback이 있는지 확인

### 문제: 레이아웃 시프트 (섹션이 깜빡임)
- `{isVideoReady && (<>...</>)}` 조건부 렌더링 적용했는지 확인
- 프리로드 import가 있는지 확인

### 문제: 두 개의 로딩 스피너
- `Suspense fallback={null}` 설정했는지 확인
- PageLoading 컴포넌트가 검은 배경인지 확인

---

**작성일**: 2025-11-08
**최종 수정**: 2025-12-28 (Footer 타이밍 문제 해결, 체크리스트 추가)
**버전**: 1.1.0
**다음 업데이트**: 추가 시나리오 발견 시
