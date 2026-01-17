# Nasun Website Design System & Layout Convention

> Based on: UnifiedOnchain.tsx & StrategyOverviewV2.tsx Analysis
> Last Updated: 2026-01-17

## 1. Page Layout Structure

### 1.1 Container & Wrapper
모든 주요 컨텐츠 페이지는 `SectionLayout` 컴포넌트를 래퍼로 사용합니다.

- **Max Width:** `max-w-6xl` (1152px)
  - `className="!max-w-6xl"`
- **Padding Top:** 페이지에 따라 유동적이나, 헤더 바로 아래 시작하는 경우 `!pt-0` 사용.

### 1.2 Grid & Spacing System (Critical)
반응형 디자인을 위한 간격 규칙이 매우 엄격하게 정의되어 있습니다.

**A. 섹션 간 간격 (Between Main Sections)**
최상위 `div` 래퍼에서 `flex flex-col`과 함께 다음 gap scale을 사용합니다.
- **Scale:** `gap-6 md:gap-8 lg:gap-10`
  - Mobile: 24px (gap-6)
  - Tablet: 32px (gap-8)
  - Desktop: 40px (gap-10)

**B. 내부 컨텐츠 간격 (Inside Sections)**
`section` 태그 내부의 텍스트 단락(`p`) 간 간격입니다.
- **Scale:** `space-y-2 md:space-y-3 lg:space-y-4`
  - Mobile: 8px (space-y-2)
  - Tablet: 12px (space-y-3)
  - Desktop: 16px (space-y-4)

**C. 그리드 시스템 (Grid Layouts)**
카드나 박스를 배치할 때 사용하는 그리드 설정입니다.
- **Standard:** `grid grid-cols-1 md:grid-cols-2`
- **Multi-column:** `grid md:grid-cols-1 lg:grid-cols-3`
- **Gap:** `gap-6` (24px) 또는 `gap-8` (32px)
- **Margin Top:** 그리드가 텍스트 뒤에 올 경우 `mt-2 md:mt-3 lg:mt-4` 적용.

## 2. Typography & Text Styles

### 2.1 Titles
- **Page Title (H2):**
  - Component: `<PageTitle>`
  - Style: `normal-case` (기본 대문자 변환 해제)
  - Subtitle Style: `font-normal`, `tracking-wide`, `text-nasun-white`
  - Line Height: `text-xl/tight md:text-2xl/tight lg:text-3xl/tight`
- **Section Title (H4):**
  - Component: `<SectionTitle as="h4">`

### 2.2 Body Text
- **Basic:** 기본 텍스트 색상은 테마의 기본값을 따름.
- **Emphasis (Highlight):**
  - Color: `text-nasun-white` (흰색 강조)
  - Weight: `font-medium`
  - Inline Highlighting: `Trans` 컴포넌트 내에서 `<strong className="text-nasun-white font-medium" />` 사용.
- **Brand Emphasis:** `text-nasun-c1` (청록색 강조)
- **Light / Introduction:**
  - Style: `text-nasun-white/90`, `font-light`
  - Size: `text-lg` 또는 `text-lg md:text-xl`
  - Leading: `leading-relaxed` (줄간격 넓게)
- **Special Styles:**
  - `italic`: 결론이나 부연 설명에 사용.
  - `underline underline-offset-4 decoration-nasun-c1/50`: 부드러운 하단 강조선.

### 2.3 Lists (Bullet Points)
- **Container:** `ul` with `list-disc`
- **Padding:** `pl-6` or `pl-8 md:pl-12`
- **Spacing:** `space-y-2` or `space-y-3` or `space-y-4`
- **Marker Color:** `marker:text-nasun-c1` (청록색 불렛)

## 3. Component Styling (Specific Classes)

### 3.1 DividerBox & OuterBox
박스형 컨텐츠를 위한 표준 컴포넌트입니다.

- **Color Props:** 
  - `color="w1"`: White/Neutral theme
  - `color="c1"`: Brand Blue/Cyan theme
- **Padding Props:** 
  - `padding="sm"`: 기본 정보 그룹화용 (16px-24px)
  - `padding="md"`: 강조 섹션용 (24px-32px)
- **Icons:**
  - Size: `w-5 h-5` (Standard) or `w-6 h-6` (Featured)
  - Color: `text-nasun-c1`
- **Title Styling:**
  - Class: `titleClassName="!text-nasun-c1"` (제목 색상 강조 필요 시)

### 3.2 Buttons
- **Primary Action:**
  - Props: `variant="c1"`, `size="lg"`
  - Layout: `flex w-fit items-center gap-2 mt-6 mx-auto` (중앙 정렬 기준)

## 4. Key Design Patterns (Summary)

1.  **반응형 스케일링:** 모든 주요 간격(`gap`, `space-y`, `mt`)은 `mobile -> md -> lg` 3단계를 명시적으로 정의하여 일관성을 유지합니다.
2.  **색상 계층:**
    *   기본 텍스트: Grayish
    *   강조 1단계: `text-nasun-white` (가독성 확보)
    *   강조 2단계 (브랜드): `text-nasun-c1` (아이콘, 불렛, 핵심 키워드)
3.  **가독성:** 긴 텍스트 블록이나 소개글에는 `text-lg font-light leading-relaxed`를 적용하여 시각적 피로도를 낮춥니다.
4.  **아이콘 일관성:** `Lucide-react` 아이콘 사용 시 박스 테마에 맞춰 `text-nasun-c1` 색상을 적용합니다.
