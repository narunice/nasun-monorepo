# Carousel Video Frame Jump Issue

## Summary

`WhatWeBuildingSection.tsx`의 react-slick 캐러셀에서 마지막 슬라이드(Protocol)에서 첫 슬라이드(GenSol)로 wrap-around 전환 시, GenSol 동영상에 프레임 점프(순간적인 프레임 건너뜀)가 발생한다.

## 재현 조건

- **파일**: `apps/nasun-website/frontend/src/sections/home/WhatWeBuildingSection.tsx`
- **환경**: 개발서버 (`pnpm dev:nasun-website`, port 5174)
- **재현**: What We're Building 섹션에서 autoplay (10초 간격)로 4번째 카드(EXPLORE NASUN) → 1번째 카드(EXPLORE GEN SOL)로 전환될 때 관찰
- **증상**: GenSol 동영상이 슬라이드 인 직후 멈추는 순간 몇 프레임이 건너뛰는 현상
- **Pado/Explorer에는 문제 없음**: 정방향 전환 시 항상 real 슬라이드로 이동하며 클론 미사용

## 근본 원인

`infinite: true` 모드에서 react-slick은 DOM 클론을 생성한다:

```
[Protocol clone] [GenSol real] [Baram] [Pado] [Protocol real] [GenSol clone]
```

정방향 autoplay 순서:
```
GenSol(real) → Baram → Pado → Protocol(real) → GenSol(clone) → snap to GenSol(real)
```

1. 4→1 wrap-around 시, slick은 **GenSol 클론**으로 슬라이드 애니메이션 수행
2. 애니메이션 완료 후, 클론에서 **real GenSol**로 즉시 교체(snap)
3. 클론과 real의 `<video>` 요소가 독립적으로 재생되어 `currentTime`이 다름
4. snap 시점에 프레임 위치 차이 → 시각적 프레임 점프

**GenSol만 영향받는 이유**: 첫 번째 슬라이드이므로 클론이 트랙 끝에 배치되고, 4→1 wrap-around에서 이 클론이 사용됨. Pado(3번째), Explorer(4번째)는 정방향 전환 시 real 슬라이드로 직접 이동.

## 시도한 접근법

### 1. GPU 합성 강제 (실패)

카드 컨테이너에 `will-change-transform`, `backface-hidden`, `transform-gpu` 적용.

```tsx
className="... will-change-transform backface-hidden transform-gpu"
```

**결과**: 효과 없음. 문제의 원인이 CSS 레이아웃 시프트가 아니라 video `currentTime` 차이.

### 2. `useTransform: false` (실패)

slick의 CSS transform 대신 `left` 포지셔닝 사용.

```tsx
const sliderSettings = { useTransform: false, ... };
```

**결과**: 효과 없음. transform vs left positioning은 클론 video의 `currentTime` 불일치와 무관.

### 3. `afterChange` 콜백으로 동기화 (부분 성공)

전환 완료 후 활성 슬라이드의 `currentTime`을 클론에 동기화.

```tsx
const syncVideos = useCallback(() => {
  const activeSlide = container.querySelector('.slick-active video');
  allVideos.forEach(video => {
    if (video !== activeSlide && video.src === activeSlide.src) {
      video.currentTime = activeSlide.currentTime;
    }
  });
}, []);
// <Slider afterChange={syncVideos} />
```

**결과**: 미세한 프레임 점프 여전히 존재. `afterChange`는 snap 이후에 실행되므로, 사용자가 이미 점프를 본 뒤 동기화됨.

### 4. `setInterval` 200ms 주기 동기화 (실패 -- 깜빡임 발생)

200ms마다 활성 video의 `currentTime`을 클론에 지속적으로 동기화.

```tsx
useEffect(() => {
  const interval = setInterval(() => {
    const activeVideo = container.querySelector('.slick-current video');
    container.querySelectorAll('video').forEach(v => {
      if (v !== activeVideo && v.src === activeVideo.src
          && Math.abs(v.currentTime - activeVideo.currentTime) > 0.15) {
        v.currentTime = activeVideo.currentTime;
      }
    });
  }, 200);
  return () => clearInterval(interval);
}, []);
```

**결과**: 프레임 점프는 줄었으나, `currentTime` 반복 설정이 video seek를 유발하여 **깜빡임(flicker)** 발생. 사용 불가.

### 5. `infinite: false` + 수동 `slickGoTo(0)` (부분 성공)

클론 자체를 제거하여 프레임 점프 원천 차단. 마지막 슬라이드 도달 시 수동으로 첫 슬라이드로 이동.

```tsx
infinite: false,
afterChange: (current) => {
  if (current === SLIDES.length - 1) {
    setTimeout(() => sliderRef.current?.slickGoTo(0), 10000);
  }
},
```

**결과**: 프레임 점프 해결. 그러나 `slickGoTo(0)`가 **역방향 슬라이드**(4→3→2→1)를 발생시킴. 사용자가 정방향 전용을 원하여 기각.

### 6. `beforeChange` 콜백으로 동기화 (현재 적용중 -- 미검증)

전환 직전에 클론 video의 `currentTime`을 원본과 동기화. 애니메이션 500ms 동안 같은 미디어를 같은 속도로 재생하므로 snap 시점에 drift가 최소화될 것으로 기대.

```tsx
const syncCloneVideos = useCallback(() => {
  const originals = container.querySelectorAll('.slick-slide:not(.slick-cloned) video');
  const clones = container.querySelectorAll('.slick-cloned video');
  clones.forEach(clone => {
    originals.forEach(original => {
      if (clone.src === original.src) {
        clone.currentTime = original.currentTime;
      }
    });
  });
}, []);
// <Slider beforeChange={syncCloneVideos} />
```

**상태**: 코드 적용 완료, 사용자 검증 대기중.

**잠재적 한계**: `currentTime` 설정 시 브라우저가 가장 가까운 키프레임으로 seek한 뒤 디코딩하므로, seek 자체에 수십ms 소요 가능 (Seeking Latency). 키프레임 간격이 2-5초인 H.264 영상에서는 sync 정밀도가 떨어질 수 있음.

## 디버그 방법 (코드 수정 없음)

아래 스크립트를 브라우저 개발자 도구(F12) Console에서 실행하여 문제를 수치화할 수 있다.

### 방법 A: 비디오별 실시간 시간 차이 추적 (Console Overlay)

모든 비디오 요소에 현재 시간을 표시하는 플로팅 레이블을 부착하여, Snap 시점에 숫자가 튀는지 확인.

```js
(function() {
  const videos = document.querySelectorAll('video');
  videos.forEach((v, i) => {
    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.top = '10px';
    label.style.left = '10px';
    label.style.background = 'rgba(0,0,0,0.7)';
    label.style.color = 'white';
    label.style.zIndex = '9999';
    label.style.padding = '4px';
    label.className = 'debug-label';
    v.parentElement.style.position = 'relative';
    v.parentElement.appendChild(label);

    setInterval(() => {
      const isCloned = v.closest('.slick-cloned') ? '(CLONE)' : '(REAL)';
      label.innerText = `${isCloned} T: ${v.currentTime.toFixed(3)}`;
    }, 50);
  });
})();
```

**확인 포인트**: 4→1 전환 시 "CLONE" 레이블의 시간과 Snap 직후 "REAL" 레이블의 시간 차이 관찰.

### 방법 B: Snap 시점의 시간 오차 로그 출력 (MutationObserver)

react-slick의 클래스/스타일 변화를 감지하여 Snap 발생 순간의 `currentTime` 차이를 콘솔에 기록.

```js
let lastTime = 0;
const observer = new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    if (m.attributeName === 'style' || m.attributeName === 'class') {
      const activeVideo = document.querySelector('.slick-current:not(.slick-cloned) video');
      if (activeVideo) {
        console.log(`[Snap Sync Check] Current Real Video Time: ${activeVideo.currentTime}`);
      }
    }
  });
});

const slider = document.querySelector('.slick-track');
if (slider) {
  observer.observe(slider, { attributes: true });
}
```

### 방법 C: 네트워크 및 디코딩 부하 확인

1. **Network 탭**: Snap 시점에 `.mp4` 파일에 대한 새로운 요청 발생 여부 확인 (브라우저가 클론 비디오를 별도 자원으로 취급할 때 발생)
2. **Performance 탭**: Long Task 발생 여부, Seek 관련 이벤트의 CPU 점유율 확인

### 판단 기준

| Snap 시점 시간 차이 | 조치 |
|---|---|
| < 0.05초 | `beforeChange` sync로 충분. 현재 코드 유지 |
| 0.05 ~ 0.1초 | `beforeChange` + `afterChange` 이중 sync 또는 Seeking Latency 최적화 |
| > 0.1초 | sync 방식 한계. 라이브러리 교체 또는 구조 변경 필요 |

## 미시도 접근법 (향후 검토 가능)

### A. `fade: true` 전환 모드

opacity 기반 전환으로 클론 문제 우회. 프레임 점프 원천 해결 가능하나, 사용자가 슬라이드 애니메이션을 원하여 기각됨.

### B. react-slick 대체 라이브러리

Embla Carousel, Swiper 등 클론 없이 infinite loop을 지원하는 라이브러리로 교체. 가장 근본적인 해결책이나 마이그레이션 비용 발생.

### C. Canvas 미러링

하나의 video 요소만 사용하고, 클론 위치에는 canvas로 실시간 프레임을 복제. 완벽한 동기화 보장이나 구현 복잡도 높음.

### D. video 요소 재사용 (DOM 이동)

클론에 별도 video를 두지 않고, 전환 시 실제 video DOM 노드를 클론 위치로 이동. react-slick 내부 구조에 대한 깊은 개입 필요.

### E. `requestVideoFrameCallback` 활용

브라우저의 `requestVideoFrameCallback` API로 프레임 단위 동기화. 높은 정밀도이나 브라우저 지원 제한적.

## Seeking Latency 인사이트

`currentTime` 설정 시 브라우저의 동작:

1. 요청된 시간이 아닌 **가장 가까운 키프레임**으로 먼저 seek
2. 키프레임에서 목표 프레임까지 순차적으로 디코딩
3. H.264 키프레임 간격이 2-5초일 수 있어 seek 자체에 수십ms 소요 가능
4. 즉, `beforeChange`에서 sync해도 **클론이 실제로 정확한 프레임에 도달하기 전에 애니메이션이 시작**될 가능성

이 때문에 `currentTime` 기반 sync 방식은 구조적 한계가 있으며, 디버그 방법 A/B로 실제 오차를 수치화한 뒤 방향을 결정해야 함.

## 현재 파일 상태

- **캐러셀 설정**: `infinite: true`, `speed: 500`, `autoplaySpeed: 10000`
- **동기화**: `beforeChange` 콜백으로 클론-원본 video 동기화
- **비디오**: GenSol (Trakker-Flying-26rf.mp4), Pado (Pado-Ui-Demo-Final-rf26.mp4, startTime: 26), Explorer (Explorer-Ui-Demo-rf15.mp4)
- **라이브러리**: react-slick v0.30.3
