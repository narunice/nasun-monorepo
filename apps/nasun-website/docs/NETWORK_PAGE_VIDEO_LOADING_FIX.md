# Network Page 비디오 로딩 문제 해결 보고서

**작업 일시**: 2025-11-17
**문제**: Network 페이지에서 Footer와 섹션들이 Hero 비디오 로딩 스핀보다 먼저 렌더링되는 문제
**심각도**: Medium (UX 저하, 레이아웃 시프트)

---

## 📋 문제 증상

### 잘못된 렌더링 순서

Network 페이지(`/vision/network`) 접속 시:

1. ❌ 네비게이션바 표시
2. ❌ Footer 텍스트와 파트너 아이콘 먼저 표시
3. ❌ 로딩 스피너 표시 (z-40 오버레이)
4. ❌ 로딩 스피너가 약간 내려감
5. ❌ NSN NETWORK 타이틀 표시
6. ❌ Hero 섹션 배경 동영상 표시
7. ❌ 모든 섹션이 갑자기 아래로 밀림 (레이아웃 시프트)

### 기대 동작

1. ✅ 네비게이션바만 표시
2. ✅ 로딩 스피너 (전체 화면 z-40)
3. ✅ 비디오 재생 시작
4. ✅ NSN NETWORK 타이틀 + 모든 섹션 + Footer 동시에 부드럽게 나타남

---

## 🔍 근본 원인 분석

### 1. PageLoadingContext 타이밍 불일치

**파일**: `frontend/src/contexts/PageLoadingContext.tsx`

#### 문제가 있던 로직 (Lines 26-41):

```tsx
useEffect(() => {
  if (location.pathname === "/" || location.pathname === "/home") {
    // HomePage: 즉시 Footer 숨김
    clearTimer();
    setIsPageReady(false);
  } else {
    // ⚠️ 다른 페이지: 1초 후 Footer 표시
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsPageReady(true); // Footer 렌더링
      timerRef.current = null;
    }, 1000);
  }

  return () => clearTimer();
}, [location.pathname, clearTimer]);
```

**문제점**:

- HomePage(`/`)만 특별 취급
- Network 페이지(`/vision/network`)는 1초 후 자동으로 Footer 표시
- 하지만 비디오 로딩은 2-10초 걸림
- **결과**: Footer가 z-40 오버레이 아래 숨겨졌다가 비디오 준비 후 갑자기 나타남

### 2. 라우팅 경로 불일치

**초기 수정 시도**:

```tsx
location.pathname === "/vision/nasunnetwork"; // ❌ 잘못된 경로
```

**실제 라우팅 경로** (routesConfig.ts Line 70):

```tsx
{
  name: "navigation.nsnNetwork",
  path: "/vision/network",  // ✅ 정확한 경로
  element: Pages.VisionNetwork,
}
```

→ 경로 불일치로 PageLoadingContext가 Network 페이지를 감지하지 못함

### 3. 타임라인 비교

#### ❌ 문제 발생 (수정 전):

```
T=0ms:    /vision/network 접속
          → PageLoadingContext: "다른 페이지" 감지
          → 1초 타이머 시작
          → NetworkHeroSection 비디오 로딩 시작
          → Hero: "fixed z-40" 전체 화면 덮음

T=1000ms: PageLoadingContext 타이머 만료
          → isPageReady = true
          → Footer와 모든 섹션 DOM에 추가 (z-40 아래 숨겨짐)
          → 비디오 여전히 로딩 중...

T=2-10s:  비디오 준비 완료
          → Hero: "relative"로 변경
          → Footer와 섹션들이 갑자기 나타남 (레이아웃 시프트 발생)
```

#### ✅ 정상 동작 (수정 후):

```
T=0ms:    /vision/network 접속
          → PageLoadingContext: "비디오 Hero 페이지" 감지
          → isPageReady = false 유지
          → NetworkHeroSection 비디오 로딩 시작
          → Hero: "fixed z-40" 전체 화면 덮음
          → Footer 렌더링되지 않음

T=2-10s:  비디오 준비 완료
          → handleVideoReady() 호출
          → setIsPageReady(true)
          → Footer와 섹션들 렌더링 시작
          → Hero: "relative"로 전환
          → 모든 요소가 동시에 부드럽게 나타남
```

---

## ✅ 해결 방법

### Phase 1: NetworkHeroSection 비디오 로딩 패턴 적용

**파일**: `frontend/src/components/app/vision/NetworkHeroSection.tsx`

#### 변경 사항:

1. **Props 인터페이스 추가**:

```tsx
interface NetworkHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

function NetworkHeroSection({ onVideoReady, isVideoReady }: NetworkHeroSectionProps) {
```

2. **상태 관리 개선**:

```tsx
const [isVideoLoaded, setIsVideoLoaded] = useState(false);
const [isVideoPlaying, setIsVideoPlaying] = useState(false);
```

3. **비디오 이벤트 핸들러**:

```tsx
// 비디오 can play 핸들러
const handleVideoCanPlay = () => {
  setIsVideoLoaded(true);
  onVideoReady?.();
};

// 비디오 playing 핸들러
const handleVideoPlaying = () => {
  setIsVideoPlaying(true);
};
```

4. **Timeout Fallback** (느린 네트워크 대응):

```tsx
useEffect(() => {
  const timeout = setTimeout(() => {
    if (!isVideoLoaded) {
      setIsVideoLoaded(true);
      setIsVideoPlaying(true);
      onVideoReady?.();
    }
  }, 10000);

  return () => clearTimeout(timeout);
}, [isVideoLoaded, onVideoReady]);
```

5. **CSS 기반 위치 제어**:

```tsx
const containerClassName = !isVideoReady
  ? "fixed inset-0 z-40 bg-nasun-white dark:bg-nasun-black h-screen overflow-hidden flex items-center justify-center"
  : "relative !p-0 -mt-14 md:mt-0";
```

6. **로딩 UI 변경**:

```tsx
{
  /* SectionLoading → InlineLoading */
}
{
  !isVideoPlaying && (
    <div className="absolute inset-0 bg-nasun-white dark:bg-nasun-black flex items-center justify-center z-20">
      <InlineLoading message="Loading..." size="lg" />
    </div>
  );
}
```

7. **비디오 이벤트 연결**:

```tsx
<video
  onCanPlay={handleVideoCanPlay}
  onPlaying={handleVideoPlaying}
  // ...
/>
```

### Phase 2: NetworkPage 비디오 로딩 제어 추가

**파일**: `frontend/src/pages/vision/NetworkPage.tsx`

#### 변경 사항:

1. **Context 및 상태 추가**:

```tsx
import { usePageLoading } from "../../contexts/PageLoadingContext";

const [isVideoReady, setIsVideoReady] = useState(false);
const { setIsPageReady } = usePageLoading();
```

2. **페이지 마운트 시 Footer 숨김**:

```tsx
useEffect(() => {
  setIsPageReady(false);
}, [setIsPageReady]);
```

3. **비디오 준비 콜백**:

```tsx
const handleVideoReady = useCallback(async () => {
  setIsVideoReady(true);

  // 중요한 섹션들 프리로드
  await Promise.all([
    import("../../components/app/vision/NasunNetworkSection"),
    import("../../components/app/vision/NasunTokenSection"),
  ]);

  setIsPageReady(true); // Footer 표시
}, [setIsPageReady]);
```

4. **Body 스크롤 제어**:

```tsx
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
```

5. **Props 전달**:

```tsx
<NetworkHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
```

### Phase 3: PageLoadingContext 경로 수정 (최종 해결)

**파일**: `frontend/src/contexts/PageLoadingContext.tsx`

#### 변경 사항:

```tsx
useEffect(() => {
  // 비디오 hero 섹션이 있는 페이지들: Footer를 비디오 로딩 완료 후에만 표시
  const isPageWithVideoHero =
    location.pathname === "/" ||
    location.pathname === "/home" ||
    location.pathname === "/vision/network"; // ✅ 수정: 정확한 경로

  if (isPageWithVideoHero) {
    // 비디오 hero 페이지: 즉시 false로 설정, 타이머 중단
    clearTimer();
    setIsPageReady(false);
  } else {
    // 다른 페이지: 1000ms 후 Footer 표시 (페이지 콘텐츠 로딩 대기)
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsPageReady(true);
      timerRef.current = null;
    }, 1000);
  }

  return () => clearTimer();
}, [location.pathname, clearTimer]);
```

---

## 📊 다국어 지원 개선 (추가 작업)

### 영어 고정 헤딩

다음 헤딩들을 언어 설정과 관계없이 **영어로만 표시**:

1. **NasunNetworkSection.tsx** (Line 48-50):

```tsx
<h1 className="max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto font-semibold text-nasun-black dark:text-nasun-white">
  Use the best out there or build it.
</h1>
```

2. **NasunTokenSection.tsx** (Line 45-47):

```tsx
<h1 className="font-semibold max-w-[410px] md:max-w-lg lg:max-w-none">
  Four main use cases for the NSN token.
</h1>
```

3. **MoveTogetherSection.tsx** (Line 48-50):

```tsx
<h1 className="mx-auto max-w-xl font-semibold text-nasun-black dark:text-nasun-white mb-4">
  Move together into our shared future.
</h1>
```

4. **TokenDistribution/index.tsx** (Line 29-31):

```tsx
<h1 className="font-semibold text-center lg:text-left text-nasun-black dark:text-nasun-white">
  NSN Token Distribution
</h1>
```

### 한국어 지원 추가

**TokenDistribution/index.tsx**:

1. **useTranslation Hook 추가**:

```tsx
import { useTranslation } from "react-i18next";

const { t } = useTranslation("tokenomics");
```

2. **TOTAL SUPPLY 번역**:

```tsx
<h6 className="text-nasun-black/70 dark:text-nasun-white/70">
  {t("distribution.supply").toUpperCase()}
</h6>
```

3. **레이블 번역**:

```tsx
<CommunityLabelBlock
  title={t("distribution.community_reserve.title")}
  // ...
/>
<LabelBlock
  title={t("distribution.public_sales.title")}
  // ...
/>
<LabelBlock
  title={t("distribution.early_contributors")}
  // ...
/>
<LabelBlock
  title={t("distribution.nasun_core")}
  // ...
/>
<LabelBlock
  title={t("distribution.testers")}
  // ...
/>
```

### 한국어 번역 업데이트

**ko/tokenomics.json** (Lines 82-84):

```json
{
  "early_contributors": "초기 기여자",
  "nasun_core": "나선 코어팀", // 수정: "나선 코어" → "나선 코어팀"
  "testers": "초기 테스터, 서포터 및 커뮤니티" // 수정: 긴 버전 → 짧은 버전
}
```

---

## 🎯 수정된 파일 목록

1. **frontend/src/contexts/PageLoadingContext.tsx**

   - Line 31: 라우팅 경로 수정 (`/vision/nasunnetwork` → `/vision/network`)

2. **frontend/src/components/app/vision/NetworkHeroSection.tsx**

   - Props 인터페이스 추가
   - 비디오 로딩 패턴 적용 (HomePage 패턴)
   - CSS 기반 위치 제어

3. **frontend/src/pages/vision/NetworkPage.tsx**

   - usePageLoading Hook 통합
   - 비디오 준비 콜백 추가
   - Body 스크롤 제어

4. **frontend/src/components/app/vision/NasunNetworkSection.tsx**

   - 헤딩 영어 고정

5. **frontend/src/components/app/vision/NasunTokenSection.tsx**

   - 헤딩 영어 고정

6. **frontend/src/components/app/vision/MoveTogetherSection.tsx**

   - 헤딩 영어 고정

7. **frontend/src/components/app/vision/TokenDistribution/index.tsx**

   - useTranslation Hook 추가
   - 모든 레이블 한국어 지원

8. **frontend/src/assets/locales/ko/tokenomics.json**
   - "나선 코어팀" 번역 수정
   - "초기 테스터, 서포터 및 커뮤니티" 번역 수정

---

## ✅ 검증 완료

### 로컬 테스트 (http://localhost:5174/vision/network)

**렌더링 순서**:

1. ✅ 네비게이션바만 표시
2. ✅ 전체 화면 로딩 스피너 (z-40)
3. ✅ 비디오 재생 시작
4. ✅ NSN NETWORK 타이틀 + 모든 섹션 + Footer 동시에 표시
5. ✅ 레이아웃 시프트 없음

**다국어 테스트**:

- ✅ 영어 모드: 모든 헤딩 영어, Token Distribution 레이블 영어
- ✅ 한국어 모드: 헤딩 영어, Token Distribution 레이블 한국어

---

## 📚 참고 패턴

### HomePage 비디오 로딩 패턴

이 해결 방법은 **HomePage.tsx**와 **HeroSection.tsx**의 패턴을 따릅니다:

1. **CSS 기반 위치 제어**: `fixed inset-0 z-40` (로딩 중) → `relative` (준비 완료)
2. **Context 통합**: PageLoadingContext로 Footer 표시 제어
3. **Body 스크롤 제어**: 로딩 중 `overflow: hidden`
4. **섹션 프리로드**: Promise.all로 중요 섹션 미리 로드
5. **Timeout Fallback**: 10초 후 강제 표시 (느린 네트워크 대응)

### 핵심 원칙

**비디오 Hero 페이지는 PageLoadingContext에서 특별 취급**:

```tsx
const isPageWithVideoHero =
  location.pathname === "/" ||
  location.pathname === "/home" ||
  location.pathname === "/vision/network";
```

이렇게 하면:

- ✅ Footer가 비디오 준비 **이후**에만 렌더링
- ✅ 레이아웃 시프트 방지
- ✅ 일관된 로딩 UX
- ✅ 다른 페이지는 1초 후 Footer 표시 (빠른 로딩)

---

## 🚀 성과

- ✅ **레이아웃 시프트 제거**: Footer와 섹션이 비디오 이후에만 표시
- ✅ **일관된 UX**: HomePage와 동일한 부드러운 로딩 경험
- ✅ **성능 개선**: 섹션 프리로드로 렌더링 속도 향상
- ✅ **다국어 지원**: 영어 헤딩 + 한국어 레이블 완벽 지원

---

## 📖 관련 문서

- **HomePage 로딩 패턴**: [HOMEPAGE_LOADING_PATTERN_GUIDE.md](HOMEPAGE_LOADING_PATTERN_GUIDE.md)
- **로딩 컴포넌트 통일**: [LOADING_COMPONENT_UNIFICATION.md](LOADING_COMPONENT_UNIFICATION.md)
- **프로젝트 가이드**: [CLAUDE.md](../CLAUDE.md)

---

**작성자**: Claude Code
**문서 버전**: 1.0.0
**최종 업데이트**: 2025-11-17
