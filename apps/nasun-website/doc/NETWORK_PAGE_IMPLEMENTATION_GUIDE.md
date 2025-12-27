# Network Page Implementation Guide

> **Purpose**: This document provides a comprehensive guide for implementing pages following the Network page design patterns and structure. Use this as the standard reference for creating or refactoring other pages in the website.

**Last Updated**: 2025-12-12  
**Reference Page**: `/vision/network` (http://localhost:5174/vision/network)

---

## Table of Contents

1. [Page Architecture](#page-architecture)
2. [Core Layout Components](#core-layout-components)
3. [UI Components](#ui-components)
4. [Section Structure Patterns](#section-structure-patterns)
5. [Styling Standards](#styling-standards)
6. [Typography Guidelines](#typography-guidelines)
7. [Spacing System](#spacing-system)
8. [Color Usage](#color-usage)
9. [Implementation Checklist](#implementation-checklist)

---

## Page Architecture

### Page-Level Structure

```tsx
import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { usePageLoading } from "../../contexts/PageLoadingContext";

// Lazy load all section components
const HeroSection = lazy(() => import("..."));
const Section1 = lazy(() => import("..."));
// ... more sections

const YourPage = () => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  // Page mount: hide footer only for video hero pages
  // Note: Add your page path to isPageWithVideoHero list in PageLoadingContext.tsx
  useEffect(() => {
    // PageLoadingContext handles the initial state based on path
    // No need to manually set setIsPageReady(false) here if path is registered
  }, []);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);
    
    // Preload critical sections
    await Promise.all([
      import("..."),
      import("..."),
    ]);
    
    setIsPageReady(true); // Show footer
  }, [setIsPageReady]);

  // Prevent scroll during video loading
  useEffect(() => {
    document.body.style.overflow = isVideoReady ? "auto" : "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isVideoReady]);

  return (
    <ErrorBoundary fallback={<SectionLayout><p>Failed to load</p></SectionLayout>}>
      <Suspense fallback={null}>
        {/* Remove preload="auto" from video tag in HeroSection for better performance */}
        <HeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
        <Section1 />
        <Section2 />
        {/* ... more sections */}
      </Suspense>
    </ErrorBoundary>
  );
};

export default YourPage;
```

**Key Principles**:
- ✅ Lazy load all sections for performance
- ✅ Use ErrorBoundary for graceful error handling
- ✅ Manage page loading state with usePageLoading context
- ✅ Preload critical sections after hero loads
- ✅ Control scroll during loading states

---

## Core Layout Components

### 1. SectionLayout

**Purpose**: Wrapper for all page sections providing consistent spacing and max-width.

**Default Behavior**:
```tsx
<section className="w-full max-w-9xl h-full relative flex flex-col mx-auto items-center justify-center px-6 md:px-8 lg:px-10 xl:px-12 py-4 md:py-6 lg:py-8 xl:py-10">
```

**Usage**:
```tsx
import { SectionLayout } from "../../../components/layout/SectionLayout";

// Basic usage - inherits all defaults
// Note: SectionLayout already provides px-6 md:px-8 lg:px-10 xl:px-12 padding,
// so inner containers don't need additional horizontal padding
<SectionLayout>
  <div className="max-w-5xl mx-auto">
    {/* Your content */}
  </div>
</SectionLayout>

// With custom max-width override
<SectionLayout className="!max-w-6xl">
  {/* Content */}
</SectionLayout>

// With background (avoid if possible - prefer empty)
<SectionLayout className="">
  {/* Clean, no background */}
</SectionLayout>
```

**Standard Patterns**:
- ✅ **Default**: `className=""` (empty, no background)
- ✅ **Custom width**: `className="!max-w-6xl"` (use `!` to override)
- ❌ **Avoid**: `className="bg-nasun-black"` (deprecated pattern)

---

## UI Components

### 1. SectionTitle

**Purpose**: Standardized section headings with consistent sizing and colors.

**Component Props**:
```tsx
interface SectionTitleProps {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  color?: "scarlet" | "white" | "black";
  className?: string;
}
```

**Default Styling**:
- Color: `text-nasun-white/90` (90% opacity white)
- Size: Defined by global CSS for h1-h6 tags
- Font: Inherits from global typography

**Usage Examples**:
```tsx
import { SectionTitle } from "../../../ui/SectionTitle";

// Standard h3 section title
<SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
  {t("section.title")}
</SectionTitle>

// Centered h2 with uppercase
<SectionTitle as="h2" className="font-medium uppercase text-center mb-2 md:mb-3 lg:mb-4 xl:mb-5">
  {t("main.title")}
</SectionTitle>

// Custom color override
<SectionTitle as="h3" color="scarlet" className="mb-4">
  {t("special.title")}
</SectionTitle>
```

**Standard Spacing**:
- ✅ **Recommended**: `mb-2 md:mb-3 lg:mb-4` (responsive bottom margin)
- ✅ **With extra spacing**: `mb-2 md:mb-3 lg:mb-4 xl:mb-5`

---

### 2. OuterBox

**Purpose**: Semi-transparent container with border, backdrop blur, and shadow effects.

**Component Props**:
```tsx
interface OuterBoxProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "scarlet";
}
```

**Variant Styles**:
```tsx
const variantStyles = {
  default: "border-nasun-c5/50 bg-nasun-c6/90",
  c1: "border-nasun-c1/50 bg-[#312107]/90",
  c2: "border-nasun-c2/50 bg-[#312d20]/90",
  c3: "border-nasun-c3/50 bg-[#1d2d2a]/90",  // Teal/green theme
  c4: "border-nasun-c4/50 bg-[#0d1b25]/90",
  c5: "border-nasun-c5/50 bg-[#081427]/90",
  c6: "border-nasun-c6/50 bg-nasun-c6/90",
  scarlet: "border-nasun-scarlet/50 bg-[#320900]/90",
};
```

**Default Padding**: `px-6 md:px-8 lg:px-10 xl:px-12 py-4 md:py-6 lg:py-8 xl:py-10`

**Usage**:
```tsx
import { OuterBox } from "../../../ui/OuterBox";

<OuterBox variant="c3" className="">
  <SectionTitle as="h2" className="...">Title</SectionTitle>
  <p>Content...</p>
</OuterBox>
```

**When to Use**:
- ✅ Hero sections with important content
- ✅ Featured content boxes
- ✅ Call-to-action sections
- ❌ Regular text sections (use plain divs instead)

---

### 3. DividerBox

**Purpose**: Card-style box with optional title, divider line, and colored theme.

**Component Props**:
```tsx
interface DividerBoxProps {
  title?: string;
  rightTitle?: string;
  icon?: ReactNode;
  description?: string;
  children?: ReactNode;
  className?: string;
  color?: "white" | "scarlet" | "c1" | "c2" | "c3" | "c4" | "c5" | "c7" | "green";
  titleClassName?: string;
  rightTitleClassName?: string;
  descriptionClassName?: string;
}
```

**Color Themes**:
```tsx
const colorStyles = {
  c1: { border: "border-nasun-c1", background: "bg-nasun-c1/10", text: "text-nasun-c1" },
  c3: { border: "border-nasun-c3", background: "bg-nasun-c3/10", text: "text-nasun-c3" },
  c4: { border: "border-nasun-c4", background: "bg-nasun-c4/10", text: "text-nasun-c4" },
  // ... more colors
};
```

**Usage Examples**:
```tsx
import { DividerBox } from "../../../ui/DividerBox";

// With title and divider
<DividerBox
  color="c1"
  title={t("section.title")}
  titleClassName="text-nasun-c1"
  className="font-semibold"
>
  <p className="text-nasun-white/80">Content...</p>
</DividerBox>

// Description only (no title/divider)
<DividerBox
  color="c4"
  description={t("description")}
  descriptionClassName="!mb-0"
  className="min-h-[160px]"
/>

// With gradient background
<DividerBox
  color="c4"
  title={t("title")}
  titleClassName="!text-nasun-c4"
  className="!bg-gradient-to-r from-nasun-c5/10 to-nasun-c4/20"
>
  {children}
</DividerBox>
```

**When to Use**:
- ✅ Feature cards with titles
- ✅ Use case descriptions
- ✅ Highlighted content sections
- ✅ Grid layouts with multiple items

---

## Section Structure Patterns

### Pattern 1: Simple Text Section

**Used in**: ReinvestingSection, NasunDepinSection (intro/conclusion)

```tsx
function SimpleTextSection() {
  const { t } = useTranslation("namespace");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("paragraph1")}</p>
          <p>{t("paragraph2")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}
```

**Key Features**:
- Container: `max-w-4xl mx-auto` (no px-4 - SectionLayout provides padding)
- Title: `uppercase mb-2 md:mb-3 lg:mb-4` (ALL CAPS)
- Paragraph spacing: `space-y-4 md:space-y-6` (responsive)
- No explicit text color/size (inherits defaults)

---

### Pattern 2: Text Section with Bullet List

**Used in**: NasunDefiSection, NasunDepinSection, InflationSection

```tsx
function TextWithBulletListSection() {
  const { t } = useTranslation("namespace");
  const items = t("list_items", { returnObjects: true }) as string[];

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("title")}
        </SectionTitle>

        {/* Intro paragraphs */}
        <div className="space-y-4 md:space-y-6 mb-8 md:mb-10 lg:mb-12">
          <p>{t("subtitle")}</p>
          <p>{t("body1")}</p>
          <p>{t("body2")}</p>
          <p>{t("body3")}</p>
        </div>

        {/* List Section with Title */}
        <div className="space-y-2 md:space-y-3 lg:space-y-4 max-w-3xl mx-auto">
          <h5 className="font-medium">{t("listTitle")}</h5>
          <ul className="space-y-1 md:space-y-2 lg:space-y-3">
            {items.map((item, index) => (
              <li key={index} className="flex">
                <span className="text-nasun-c1 mr-4">●</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SectionLayout>
  );
}
```

**Key Features**:
- Main container: `max-w-4xl mx-auto` (no px-4 - SectionLayout provides padding)
- Paragraph spacing: `space-y-4 md:space-y-6` (responsive)
- Section gap: `mb-8 md:mb-10 lg:mb-12` (between intro and list)
- **List container: `max-w-3xl mx-auto`** (들여쓰기 효과 - 본문보다 좁게)
- List title: `<h5 className="font-medium">` (optional, before the list)
- List spacing: `space-y-1 md:space-y-2 lg:space-y-3` (tighter than paragraphs)
- Bullet: Unicode `●` character with `text-nasun-c1 mr-4`

---

### Pattern 3: Featured Box Section

**Used in**: NewNasunNetworkSection

```tsx
function FeaturedBoxSection() {
  const { t } = useTranslation("namespace");

  return (
    <SectionLayout>
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto py-10 xl:py-12">
          <OuterBox variant="c3" className="">
            <SectionTitle as="h2" className="font-medium uppercase text-center mb-2 md:mb-3 lg:mb-4 xl:mb-5">
              {t("title")}
            </SectionTitle>

            <div className="flex flex-col gap-1 items-center mb-6 lg:mb-8">
              <h4 className="text-nasun-c3/90 font-semibold">{t("subtitle")}</h4>
            </div>

            <div className="mb-6 md:mb-7 lg:mb-8 xl:mb-10">
              <p className="text-nasun-white/80 whitespace-pre-line">{t("description")}</p>
            </div>

            <DividerBox color="c1" title={t("feature.title")} titleClassName="text-nasun-c1">
              <p className="text-nasun-white/80 whitespace-pre-line">{t("feature.description")}</p>
            </DividerBox>

            <div className="pt-6 md:pt-8 text-center">
              <Button variant="c3" size="xl">{t("buttonText")}</Button>
            </div>
          </OuterBox>
        </div>
      </div>
    </SectionLayout>
  );
}
```

**Key Features**:
- Nested responsive containers for centering
- OuterBox for semi-transparent background
- DividerBox for featured content within
- Centered button at bottom
- Responsive padding: `py-10 xl:py-12`

---

### Pattern 4: Grid Layout Section

**Used in**: NewMoveTogetherSection

```tsx
function GridLayoutSection() {
  const { t } = useTranslation("namespace");

  return (
    <SectionLayout className="!max-w-6xl">
      <SectionTitle as="h2" className="font-medium uppercase text-center my-2 md:my-3 lg:my-4 xl:my-5">
        {t("heading")}
      </SectionTitle>

      <div className="mb-3 md:mb-4 lg:mb-5 xl:mb-6 flex flex-col items-center">
        <h4 className="text-nasun-c4 font-semibold text-center">{t("subtitle")}</h4>
      </div>

      <p className="text-left text-nasun-white/80 mb-10 max-w-4xl mx-auto whitespace-pre-line">
        {t("description")}
      </p>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7 lg:gap-8">
        {items.map((item) => (
          <div key={item.key} className="border border-nasun-c3/50 rounded-2xl bg-[#1d2d2a] backdrop-blur-md p-6 md:p-8 transition-all hover:border-nasun-c3 hover:bg-black/60 min-h-[140px] md:min-h-[160px]">
            <div className="flex items-center gap-6 h-full">
              {/* Icon */}
              <div className="flex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-xl bg-nasun-c2/20 border-3 border-nasun-c3 flex items-center justify-center">
                <img src={item.icon} alt={t(item.titleKey)} className="w-8 h-8 md:w-10 md:h-10" />
              </div>
              
              {/* Text */}
              <div className="flex-1">
                <h4 className="font-semibold text-nasun-c3 mb-2">{t(item.titleKey)}</h4>
                <p className="text-nasun-white/80">{t(item.descKey)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionLayout>
  );
}
```

**Key Features**:
- Responsive grid: `grid-cols-1 md:grid-cols-2`
- Responsive gaps: `gap-6 md:gap-7 lg:gap-8`
- Card styling: border + background + hover effects
- Icon + text layout with flexbox
- Minimum heights for consistency

---

### Pattern 5: Split Layout (Title + Cards)

**Used in**: NewNasunTokenSection

```tsx
function SplitLayoutSection() {
  const { t } = useTranslation("namespace");

  return (
    <SectionLayout className="">
      <div className="max-w-7xl mx-auto pr-12">
        <div className="grid lg:grid-cols-[410px_1fr] xl:grid-cols-[430px_1fr] gap-x-8 py-10 lg:py-12 xl:py-14">
          
          {/* Left: Title Section */}
          <div className="flex flex-col items-center lg:items-end text-center lg:text-right">
            <h1 className="font-semibold max-w-[410px] md:max-w-lg lg:max-w-none leading-[1.1]">
              NSN Token<br />
              Four Main <br />
              Use Cases
            </h1>
            <div className="flex flex-col items-center lg:items-end justify-center text-center lg:text-right h-[180px] w-full">
              <h4 className="font-medium w-full text-nasun-c3/90 whitespace-pre-line py-4 lg:py-2 leading-tight">
                {t("subtitle")}
              </h4>
            </div>
          </div>

          {/* Right: Cards Grid */}
          <div className="space-y-6 xlg:space-y-0 xlg:grid xlg:grid-cols-2 xlg:gap-x-4 xlg:gap-y-10">
            {items.map((item, index) => (
              <DividerBox
                key={item.key}
                title={t(`uses.${item.key}.heading`)}
                color={item.color}
                titleClassName={item.titleClassName}
                description={t(`uses.${item.key}.description`)}
                className={`${item.gradient} min-h-[160px] xlg:min-h-[192px]`}
              />
            ))}
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}
```

**Key Features**:
- Two-column grid: `lg:grid-cols-[410px_1fr]` (fixed left, flexible right)
- Right-aligned title on desktop
- Stacked cards on mobile, grid on large screens
- Custom gradient backgrounds per card
- Responsive heights

---

### Pattern 6: 목록문단 (List Paragraph Section)

**Used in**: CurrentStateSection, PrototypeDevelopmentSection, BeyondPrototypeSection, HiresSection

```tsx
function ListParagraphSection() {
  const { t } = useTranslation("namespace");
  const items = t("items", { returnObjects: true }) as { title: string; description: string }[];

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          {items.map((item, index) => (
            <div key={index} className="flex gap-4">
              <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
              <div>
                <h4 className="text-base font-semibold mb-1 md:mb-2">{item.title}</h4>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionLayout>
  );
}
```

**Key Features**:
- Flex layout: `flex gap-4` (표시선과 콘텐츠 분리)
- Left line: `w-0.5 bg-nasun-c1 flex-shrink-0 my-1` (2px width, margin으로 높이 조절)
- Line height adjustment: `my-1` on line element (텍스트 줄간격 유지하면서 표시선만 축소)
- Item spacing: `space-y-4 md:space-y-6` (responsive, same as paragraphs)
- Title: `text-base font-semibold mb-1 md:mb-2`
- Description: Default paragraph styling

**목록문단 Line Styles**:
```tsx
// ✅ CORRECT (flex + my-1로 표시선 높이만 조절)
<div className="flex gap-4">
  <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
  <div>...</div>
</div>

// ❌ WRONG (border가 padding 포함 높이까지 확장됨)
<div className="border-l-2 border-nasun-c1 pl-4">...</div>
```

**When to Use**:
- ✅ Lists with title + description pairs
- ✅ Feature highlights
- ✅ Step-by-step items with explanations
- ❌ Simple bullet lists (use Pattern 2 instead)

---

## Styling Standards

### Container Widths

```tsx
// Standard hierarchy (from widest to narrowest)
max-w-9xl   // SectionLayout default (very wide)
max-w-7xl   // Special wide sections
max-w-6xl   // Wide sections
max-w-5xl   // Wide section content
max-w-4xl   // Standard section content (MOST COMMON)
max-w-3xl   // Narrower content (lists, focused reading)
max-w-2xl   // Deprecated (avoid)
```

**Standard Pattern**:
```tsx
<SectionLayout className="">
  <div className="max-w-4xl mx-auto">
    {/* Main content */}

    <div className="max-w-3xl mx-auto">
      {/* Narrower list content */}
    </div>
  </div>
</SectionLayout>
```

> **Note**: SectionLayout already provides `px-6 md:px-8 lg:px-10 xl:px-12` padding,
> so inner containers (`max-w-*`) don't need additional horizontal padding like `px-4`.

---

### Background Colors

**Standard Approach**: Avoid explicit backgrounds, let parent handle it.

```tsx
// ✅ RECOMMENDED
<SectionLayout className="">
  <div className="max-w-5xl mx-auto">
    {/* Content inherits background */}
  </div>
</SectionLayout>

// ❌ DEPRECATED (old pattern)
<SectionLayout className="bg-nasun-black">
  {/* Explicit background - avoid */}
</SectionLayout>
```

**Exception**: Use backgrounds only for special boxes (OuterBox, DividerBox, cards).

---

### Text Colors

**Standard Approach**: Inherit defaults, avoid explicit color classes.

```tsx
// ✅ RECOMMENDED (inherits from global CSS)
<p>{t("text")}</p>

// ✅ ACCEPTABLE (when specific opacity needed)
<p className="text-nasun-white/80">{t("text")}</p>

// ❌ DEPRECATED (too specific)
<p className="text-nasun-white/80 text-lg leading-relaxed">{t("text")}</p>
```

**Color Hierarchy**:
- Default: Inherits from parent (usually white/90)
- Subtle: `text-nasun-white/80` (80% opacity)
- Accent: `text-nasun-c1`, `text-nasun-c3`, `text-nasun-c4` (colored)

---

## Typography Guidelines

### Heading Sizes

Defined in global CSS (`index.css`):

```css
/* Desktop (default) */
h1 { font-size: 3.5rem; }    /* 56px */
h2 { font-size: 2.5rem; }    /* 40px */
h3 { font-size: 1.875rem; }  /* 30px */
h4 { font-size: 1.5rem; }    /* 24px */
h5 { font-size: 1.25rem; }   /* 20px */
h6 { font-size: 1rem; }      /* 16px */

/* Mobile adjustments */
@media (max-width: 768px) {
  h1 { font-size: 2.5rem; }  /* 40px */
  h2 { font-size: 2rem; }    /* 32px */
  h3 { font-size: 1.5rem; }  /* 24px */
  /* ... */
}
```

**Usage**:
```tsx
// Use SectionTitle for consistent styling
<SectionTitle as="h2">Title</SectionTitle>  // 40px desktop, 32px mobile
<SectionTitle as="h3">Title</SectionTitle>  // 30px desktop, 24px mobile

// Or use plain HTML tags (inherits global CSS)
<h4>Subtitle</h4>  // 24px
```

---

### Font Weights

```tsx
// Standard weights
font-normal    // 400 (default for body text)
font-medium    // 500 (titles, emphasis)
font-semibold  // 600 (strong emphasis)
font-bold      // 700 (rare, special cases)
```

**Usage Patterns**:
```tsx
<SectionTitle as="h2" className="font-medium">  // Titles
<h4 className="font-semibold">                   // Subtitles
<p>                                              // Body (inherits normal)
```

---

### Text Transforms

```tsx
uppercase      // ALL CAPS (use for ALL section titles)
capitalize     // First Letter Caps (rare)
normal-case    // Normal (default)
```

**Usage**:
```tsx
// Centered h2 title (featured sections)
<SectionTitle as="h2" className="font-medium uppercase text-center mb-2 md:mb-3 lg:mb-4">
  {t("title")}  // DISPLAYS AS UPPERCASE
</SectionTitle>

// Left-aligned h3 title (standard sections)
<SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
  {t("title")}  // DISPLAYS AS UPPERCASE
</SectionTitle>
```

> **Note**: ALL section titles should use `uppercase` regardless of alignment or heading level.

---

## Spacing System

### Responsive Spacing Pattern

**Standard responsive spacing** (most common):

```tsx
// Margins
mb-2 md:mb-3 lg:mb-4           // Bottom margin (titles)
mb-2 md:mb-3 lg:mb-4 xl:mb-5   // With extra large
my-2 md:my-3 lg:my-4 xl:my-5   // Vertical margin

// Padding
px-6 md:px-8 lg:px-10 xl:px-12  // Horizontal padding (containers)
py-4 md:py-6 lg:py-8 xl:py-10   // Vertical padding (sections)

// Gaps
gap-6 md:gap-7 lg:gap-8         // Grid gaps
space-y-6                        // Paragraph spacing
space-y-1 md:space-y-2 lg:space-y-3  // List item spacing
```

### Spacing Values

```
Base  MD   LG   XL
2  →  3  →  4  →  5     (0.5rem → 0.75rem → 1rem → 1.25rem)
4  →  6  →  8  →  10    (1rem → 1.5rem → 2rem → 2.5rem)
6  →  7  →  8           (1.5rem → 1.75rem → 2rem)
6  →  8  →  10  →  12   (1.5rem → 2rem → 2.5rem → 3rem)
```

### Spacing Hierarchy

```tsx
// Title spacing (tight)
mb-2 md:mb-3 lg:mb-4

// Paragraph spacing (medium)
space-y-6

// Section spacing (loose)
mb-8 md:mb-10 lg:mb-12

// List item spacing (very tight)
space-y-1 md:space-y-2 lg:space-y-3
```

---

## Color Usage

### Brand Colors

```tsx
// Primary colors (from tailwind.config.js)
nasun-c1  // #F5A623 (Orange/Gold)
nasun-c2  // #E8D21D (Yellow)
nasun-c3  // #B8E6D5 (Teal/Mint)
nasun-c4  // #4A9EFF (Blue)
nasun-c5  // #6C5CE7 (Purple)
nasun-c6  // #0A1628 (Dark Navy)
nasun-scarlet  // #FF0000 (Red)
```

### Color Application

**Borders**:
```tsx
border-nasun-c3/50   // 50% opacity border
border-nasun-c1      // Solid border
```

**Backgrounds**:
```tsx
bg-nasun-c3/10       // 10% opacity background (subtle)
bg-nasun-c6/90       // 90% opacity background (semi-transparent)
bg-[#1d2d2a]         // Custom hex (when needed)
```

**Text**:
```tsx
text-nasun-white/90  // Default white (90% opacity)
text-nasun-white/80  // Subtle white (80% opacity)
text-nasun-c1        // Accent color (solid)
text-nasun-c3/90     // Accent color (90% opacity)
```

### Color Combinations

**Teal Theme (c3)**:
```tsx
border-nasun-c3/50 bg-[#1d2d2a]/90  // OuterBox
border-nasun-c3 bg-nasun-c3/10      // DividerBox
text-nasun-c3                        // Title text
```

**Blue Theme (c4)**:
```tsx
border-nasun-c4/50 bg-[#0d1b25]/90  // OuterBox
border-nasun-c4 bg-nasun-c4/10      // DividerBox
text-nasun-c4                        // Title text
```

---

## Implementation Checklist

### Page Setup
- [ ] Create page component with lazy loading
- [ ] Add ErrorBoundary wrapper
- [ ] Implement usePageLoading hook
- [ ] Add video/loading state management
- [ ] Configure scroll prevention during load

### Section Structure
- [ ] Use `SectionLayout` as wrapper
- [ ] Set `className=""` (empty background)
- [ ] Add `max-w-4xl mx-auto` container (no px-4 - SectionLayout provides padding)
- [ ] Use `SectionTitle` for headings
- [ ] Apply responsive spacing: `mb-2 md:mb-3 lg:mb-4`

### Content Styling
- [ ] Use `space-y-4 md:space-y-6` for paragraphs (responsive)
- [ ] Use `space-y-1 md:space-y-2 lg:space-y-3` for lists
- [ ] Implement bullets using Unicode: `<span className="text-nasun-c1 mr-4">●</span>`
- [ ] Avoid explicit text colors (inherit defaults)
- [ ] **Use `max-w-3xl mx-auto` for list containers** (들여쓰기 효과)

### Special Components
- [ ] Use `OuterBox` for featured sections
- [ ] Use `DividerBox` for card layouts
- [ ] Apply appropriate color variants
- [ ] Add hover effects for interactive elements
- [ ] Implement responsive grid layouts

### Typography
- [ ] Use `SectionTitle` component for headings
- [ ] Apply `font-medium` for centered h2 titles
- [ ] Apply `font-semibold` for subtitles (h4)
- [ ] **Use `uppercase` for ALL section titles** (h2, h3)
- [ ] Let body text inherit defaults

### Spacing
- [ ] Apply responsive margins: `mb-2 md:mb-3 lg:mb-4`
- [ ] Use section spacing: `mb-8 md:mb-10 lg:mb-12`
- [ ] Apply responsive padding to containers
- [ ] Use consistent gap values in grids

### Colors
- [ ] Choose appropriate color theme (c1-c6)
- [ ] Apply 50% opacity to borders
- [ ] Apply 10% opacity to backgrounds
- [ ] Use 80-90% opacity for text
- [ ] Maintain color consistency within sections

---

## Common Patterns Summary

### Simple Text Section
```tsx
<SectionLayout className="">
  <div className="max-w-4xl mx-auto">
    <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">{t("title")}</SectionTitle>
    <div className="space-y-4 md:space-y-6">
      <p>{t("text")}</p>
    </div>
  </div>
</SectionLayout>
```

### Bullet List Section
```tsx
<SectionLayout className="">
  <div className="max-w-4xl mx-auto">
    <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">{t("title")}</SectionTitle>

    {/* Intro paragraphs */}
    <div className="space-y-4 md:space-y-6 mb-8 md:mb-10 lg:mb-12">
      <p>{t("intro")}</p>
    </div>

    {/* List Section with Title */}
    <div className="space-y-2 md:space-y-3 lg:space-y-4 max-w-3xl mx-auto">
      <h5 className="font-medium">{t("listTitle")}</h5>
      <ul className="space-y-1 md:space-y-2 lg:space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex">
            <span className="text-nasun-c1 mr-4">●</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
</SectionLayout>
```

### Grid Card Section
```tsx
<SectionLayout className="!max-w-6xl">
  <SectionTitle as="h2" className="font-medium uppercase text-center my-2 md:my-3 lg:my-4 xl:my-5">
    {t("title")}
  </SectionTitle>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7 lg:gap-8">
    {items.map(item => (
      <DividerBox key={item.key} color="c4" title={t(item.title)} className="min-h-[160px]">
        <p>{t(item.description)}</p>
      </DividerBox>
    ))}
  </div>
</SectionLayout>
```

### 목록문단 (List Paragraph Section)
```tsx
<SectionLayout className="">
  <div className="max-w-4xl mx-auto">
    <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">{t("title")}</SectionTitle>
    <div className="space-y-4 md:space-y-6">
      {items.map((item, i) => (
        <div key={i} className="flex gap-4">
          <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
          <div>
            <h4 className="text-base font-semibold mb-1 md:mb-2">{item.title}</h4>
            <p>{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
</SectionLayout>
```

---

## Reference Files

**Page Component**:
- `frontend/src/pages/vision/NetworkPage.tsx`

**Section Components**:
- `frontend/src/components/app/vision/network/NewNasunNetworkSection.tsx`
- `frontend/src/components/app/vision/network/NewNasunTokenSection.tsx`
- `frontend/src/components/app/vision/network/NewMoveTogetherSection.tsx`
- `frontend/src/components/app/vision/network/NewTokenDistributionSection.tsx`
- `frontend/src/components/app/vision/network/NasunDefiSection.tsx`
- `frontend/src/components/app/vision/network/NasunDepinSection.tsx`
- `frontend/src/components/app/vision/network/ReinvestingSection.tsx`
- `frontend/src/components/app/vision/network/InflationSection.tsx`

**UI Components**:
- `frontend/src/components/layout/SectionLayout.tsx`
- `frontend/src/components/ui/SectionTitle.tsx`
- `frontend/src/components/ui/OuterBox.tsx`
- `frontend/src/components/ui/DividerBox.tsx`

---

## Version History

- **v1.0** (2025-12-09): Initial documentation based on Network page analysis
