# Video Loading Pattern Guide

**작성일**: 2025-11-08
**최종 수정**: 2026-01-08 (사이트 전체 순차 로딩 표준화)
**버전**: 2.0.0
**작성자**: Claude Code

나선 웹사이트의 모든 페이지에서 대용량 비디오 자원을 효율적으로 로딩하기 위한 **순차적 로딩(Sequential Loading)** 및 **레이아웃 시프트 방지** 가이드입니다.

---

## 📋 목차

1. [핵심 원칙](#핵심-원칙)
2. [패턴 1: 스켈레톤 기반 공간 선점 (Layout Shift 방지)](#패턴-1-스켈레톤-기반-공간-선점-layout-shift-방지)
3. [패턴 2: Waterfall 순차 로딩 (대역폭 최적화)](#패턴-2-waterfall-순차-로딩-대역폭-최적화)
4. [구현 가이드](#구현-가이드)
5. [코드 예시 (HomePage)](#코드-예시-homepage)
6. [체크리스트](#체크리스트)

---

## 핵심 원칙

1.  **Top-Down Priority**: 페이지의 가장 상단(Hero)에 있는 비디오가 가장 높은 우선순위를 가집니다.
2.  **Sequential Loading**: 상위 섹션의 비디오 로딩이 완료(`onCanPlay`)되어야만, 하위 섹션의 비디오 로딩(`src` 할당)이 시작됩니다.
3.  **Space Reservation**: 비디오가 로딩되기 전에도 레이아웃 높이(`h-screen` 등)는 확보되어 있어야 합니다.

---

## 패턴 1: 스켈레톤 기반 공간 선점 (Layout Shift 방지)

가장 먼저 로딩되는 **Hero Section**에 필수적입니다.

### 작동 원리
1.  **Loading Phase**: `Suspense`의 fallback으로 실제 컴포넌트와 동일한 크기(`100vh`)의 스켈레톤을 표시합니다.
2.  **Mount Phase**: 실제 컴포넌트가 마운트되더라도, 비디오가 재생 준비될 때까지는 스켈레톤과 동일한 로딩 UI를 유지합니다.
3.  **Ready Phase**: 비디오 준비 완료(`onCanPlay`) 시 부드럽게(`opacity` transition) 전환합니다.

---

## 패턴 2: Waterfall 순차 로딩 (대역폭 최적화)

여러 비디오 섹션이 있는 페이지에서 필수적입니다.

### 작동 원리 (Daisy Chain)
`Hero` 로딩 완료 ➔ `Section A` 로딩 시작 ➔ `Section A` 완료 ➔ `Section B` 로딩 시작 ...

### 구현 로직
1.  **부모 페이지 (Controller)**: 각 섹션의 준비 상태(`isReady`)를 관리하고, 다음 섹션에 로딩 허가(`shouldLoad`)를 내립니다.
2.  **자식 섹션 (Consumer)**: `shouldLoadVideo` prop이 `true`가 될 때까지 `<video>` 태그를 렌더링하지 않습니다. 준비가 완료되면 `onVideoReady` 콜백을 호출합니다.

---

## 구현 가이드

### Step 1: 섹션 컴포넌트 표준 인터페이스

모든 비디오 포함 섹션은 다음 두 가지 Prop을 지원해야 합니다.

```tsx
interface VideoSectionProps {
  // Input: 상위 비디오가 준비되었으니 로딩을 시작하라는 신호
  shouldLoadVideo?: boolean;
  
  // Output: 내 비디오가 준비되었음을 알리는 콜백 (다음 섹션을 위해)
  onVideoReady?: () => void;
}
```

### Step 2: 컴포넌트 구현 (예시)

```tsx
function VideoSection({ shouldLoadVideo = false, onVideoReady }: VideoSectionProps) {
  const handleCanPlay = () => {
    // 1. 비디오 재생 시작
    videoRef.current?.play();
    // 2. 부모에게 준비 완료 알림 (다음 섹션 로딩 트리거)
    onVideoReady?.();
  };

  return (
    <div className="relative h-screen bg-nasun-black">
      {/* shouldLoadVideo가 true일 때만 video 렌더링 */}
      {shouldLoadVideo && (
        <video 
          src={videoSrc} 
          onCanPlay={handleCanPlay} 
          // ... attrs 
        />
      )}
      
      {/* 로딩 전/중에는 배경색이나 포스터 이미지 표시 */}
      <div className="absolute inset-0 bg-nasun-black -z-10" />
    </div>
  );
}
```

---

## 코드 예시 (HomePage)

`Hero` ➔ `Vision` ➔ `Wave1` ➔ `NftSale` 순서로 로딩하는 예시입니다.

```tsx
export default function HomePage() {
  // 상태 체인 (State Chain)
  const [isHeroReady, setIsHeroReady] = useState(false);
  const [isVisionReady, setIsVisionReady] = useState(false);
  const [isWave1Ready, setIsWave1Ready] = useState(false);

  return (
    <ScrollSnapContainer>
      {/* 1. Hero Section (즉시 로딩) */}
      <HeroSectionV3 
        onVideoReady={() => {
          setIsHeroReady(true);
          // ... Footer 표시 로직 등
        }} 
      />

      {/* 2. Vision Section (Hero 완료 후 로딩) */}
      <VisionSectionV2 
        shouldLoadVideo={isHeroReady}
        onVideoReady={() => setIsVisionReady(true)}
      />

      {/* 3. Wave1 Section (Vision 완료 후 로딩) */}
      <Wave1SectionV3 
        shouldLoadVideo={isVisionReady}
        onVideoReady={() => setIsWave1Ready(true)}
      />

      {/* 4. NFT Sale Section (Wave1 완료 후 로딩) */}
      <NftSaleSection 
        shouldLoadVideo={isWave1Ready}
      />
    </ScrollSnapContainer>
  );
}
```

---

## 체크리스트

- [ ] **Interface**: 컴포넌트가 `shouldLoadVideo`, `onVideoReady` prop을 가지고 있는가?
- [ ] **Conditional Rendering**: `shouldLoadVideo`가 `false`일 때 `<video>` 태그가 렌더링되지 않는가? (대역폭 차단 확인)
- [ ] **Callback**: `onCanPlay` 이벤트에서 `onVideoReady`를 호출하는가?
- [ ] **Fallback**: 비디오 로딩 전 보여줄 배경색이나 이미지가 설정되어 있어 깜빡임이 없는가?
- [ ] **Chain**: 부모 페이지에서 상태(`useState`)가 올바른 순서로 연결되어 있는가?