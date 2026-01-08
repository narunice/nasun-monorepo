# HomePage Loading Pattern Guide

**작성일**: 2025-11-08
**최종 수정**: 2026-01-08 (순차적 비디오 로딩 패턴 추가)
**버전**: 1.3.0
**작성자**: Claude Code

나선 웹사이트의 홈페이지(HomePage)에서 사용되는 로딩 패턴, 레이아웃 시프트 방지, 그리고 **비디오 로딩 최적화** 가이드입니다.

---

## 📋 목차

1. [핵심 요약](#핵심-요약)
2. [문제 정의](#문제-정의)
3. [패턴 1: 스켈레톤 기반 공간 선점 (Layout Shift 방지)](#패턴-1-스켈레톤-기반-공간-선점-layout-shift-방지)
4. [패턴 2: 순차적 비디오 로딩 (대역폭 최적화)](#패턴-2-순차적-비디오-로딩-대역폭-최적화)
5. [구현 가이드](#구현-가이드)
6. [코드 예시](#코드-예시)
7. [고급 테크닉: Footer 타이밍 제어](#고급-테크닉-footer-타이밍-제어)
8. [체크리스트](#체크리스트)

---

## 핵심 요약

홈페이지의 사용자 경험을 최적화하기 위해 두 가지 핵심 패턴을 사용합니다:

1.  **스켈레톤 기반 공간 선점**: 로딩 중 레이아웃이 깨지거나 밀리는 현상 방지 (Visual Stability)
2.  **순차적 비디오 로딩**: 중요도가 높은 히어로 비디오를 먼저 로드하고, 하단 비디오는 나중에 로드하여 초기 로딩 속도 향상 (Network Performance)

---

## 문제 정의

### 문제 1: 레이아웃 시프트 (Layout Shift)
대용량 미디어가 로드되면서 갑자기 공간을 차지하여 하단 컨텐츠가 밀려나는 현상.

### 문제 2: 대역폭 경쟁 (Bandwidth Contention)
히어로 섹션과 하단(Vision) 섹션의 비디오가 동시에 로딩을 시작하면, 한정된 네트워크 대역폭을 나눠 쓰게 되어 **가장 중요한 첫 화면(LCP)의 비디오 재생이 늦어짐**.

---

## 패턴 1: 스켈레톤 기반 공간 선점 (Layout Shift 방지)

### 작동 원리
1.  **Loading Phase**: `HeroSectionSkeleton`이 `100vh` 공간을 차지하고 로딩 스피너를 보여줍니다.
2.  **Mount Phase**: `HeroSectionV3` 코드가 로드되면 교체됩니다. 이때 `HeroSectionV3`는 비디오가 준비될 때까지 **스켈레톤과 똑같은 모습**을 유지합니다.
3.  **Ready Phase**: 비디오가 준비되면(`onCanPlay`) 비디오의 투명도(`opacity`)를 높여 부드럽게 전환합니다.

---

## 패턴 2: 순차적 비디오 로딩 (대역폭 최적화)

### 작동 원리
중요한 비디오(Hero)가 준비될 때까지 덜 중요한 비디오(Vision 등)의 로딩을 **차단**합니다.

1.  **Hero Loading**: 페이지 진입 시, 상단 Hero 비디오만 다운로드합니다.
2.  **Signal**: Hero 비디오가 준비되면(`onVideoReady`), 부모 컴포넌트에 알립니다.
3.  **Lazy Loading**: 부모는 하단 섹션에 `shouldLoadVideo={true}` 신호를 보냅니다.
4.  **Vision Loading**: 신호를 받은 하단 섹션이 비로소 `<video src="...">`를 렌더링하여 다운로드를 시작합니다.

---

## 구현 가이드

### Step 1: 스켈레톤 컴포넌트 (패턴 1)

실제 컴포넌트와 **최상위 컨테이너 스타일이 100% 일치**해야 합니다.

```tsx
// HeroSectionSkeleton.tsx
export default function HeroSectionSkeleton() {
  return (
    <div className="w-screen relative ... h-screen ... bg-nasun-black">
      <div className="absolute inset-0 ...">
        <InlineLoading message="Loading..." size="lg" />
      </div>
    </div>
  );
}
```

### Step 2: 히어로 컴포넌트 (패턴 1)

비디오가 재생되기 전까지는 스켈레톤과 똑같은 UI를 보여줍니다.

```tsx
// HeroSectionV3.tsx
function HeroSectionV3({ onVideoReady }: Props) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const handleCanPlay = () => {
    // 준비 완료 신호 전송
    onVideoReady?.();
  };

  return (
    <div className="w-screen relative ... h-screen ...">
      <video
        className={`... ${isVideoPlaying ? "opacity-100" : "opacity-0"}`}
        onCanPlay={handleCanPlay}
        onPlaying={() => setIsVideoPlaying(true)}
      />
      {!isVideoPlaying && <LoadingOverlay />}
    </div>
  );
}
```

### Step 3: 하단 비디오 컴포넌트 (패턴 2)

`shouldLoadVideo` prop을 받아 비디오 소스 할당을 제어합니다.

```tsx
// VisionSectionV2.tsx
interface Props {
  shouldLoadVideo?: boolean;
}

function VisionSectionV2({ shouldLoadVideo = false }: Props) {
  return (
    <div className="relative h-screen ...">
      {/* 신호를 받기 전에는 video 태그를 렌더링하지 않거나 src를 비워둠 */}
      {shouldLoadVideo && (
        <video autoPlay loop muted>
          <source src={videoSrc} type="video/mp4" />
        </video>
      )}
      
      {/* 비디오 로딩 전 보여줄 대체 이미지나 배경색 */}
      {!shouldLoadVideo && <div className="absolute inset-0 bg-nasun-white" />}
    </div>
  );
}
```

---

## 코드 예시

### `frontend/src/pages/HomePage.tsx`

```tsx
import { Suspense, lazy, useState, useCallback } from "react";
// ... imports

export default function HomePage() {
  const [isVideoReady, setIsVideoReady] = useState(false); // Hero 비디오 준비 상태

  // 비디오 로딩 완료 핸들러
  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true); // 1. Hero 준비 완료 -> 하단 비디오 로딩 허용

    // 2. 중요 섹션 코드 프리로드
    await Promise.all([
      import("../components/app/home/VisionSectionV2"),
      // ...
    ]);

    // 3. Footer 표시 (레이아웃 시프트 방지)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  return (
    <ScrollSnapContainer>
      <Suspense fallback={<HeroSectionSkeleton />}>
        {/* Hero Section */}
        <ScrollSnapSection>
          <HeroSectionV3 onVideoReady={handleVideoReady} />
        </ScrollSnapSection>

        {/* Vision Section: Hero가 준비된 후에만 비디오 로딩 시작 */}
        <ScrollSnapSection>
          <VisionSectionV2 shouldLoadVideo={isVideoReady} />
        </ScrollSnapSection>

        {/* 다른 섹션들... */}
      </Suspense>
    </ScrollSnapContainer>
  );
}
```

---

## 고급 테크닉: Footer 타이밍 제어

비디오 로딩이 완료된 직후 Footer가 갑자기 나타나거나 위치가 튀는 것을 막기 위해 `requestAnimationFrame`을 사용합니다.

```tsx
requestAnimationFrame(() => {        // 현재 프레임 처리 대기
  requestAnimationFrame(() => {      // 다음 프레임 준비 대기
    setIsPageReady(true);            // 이제 안전하게 Footer 표시!
  });
});
```

---

## 체크리스트

새로운 비디오 페이지를 만들 때 확인하세요:

- [ ] **스켈레톤 생성**: 실제 컴포넌트와 `width`, `height`, `layout`이 일치하는가?
- [ ] **공간 선점**: 로딩 전후 높이 변화가 없는가?
- [ ] **순차적 로딩**: Hero 비디오가 준비되기 전에는 하단 비디오의 로딩(`src` 할당)을 막았는가?
- [ ] **Props 연결**: 부모 페이지에서 `isVideoReady` 상태를 하단 섹션의 `shouldLoadVideo`로 연결했는가?
- [ ] **Fallback UI**: 하단 비디오 로딩 전 보여줄 배경색이나 이미지가 있는가?
