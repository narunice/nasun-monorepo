# Nasun Website Design System & Style Guide

> Reference: Nasun Website Frontend (2026-01)
> Last Updated: 2026-01-23

This document is the **single source of truth** for UI styling, layout conventions, and component usage in the Nasun Website. It merges the previous Style Guide and Page Design Conventions.

---

## 1. Core Design Principles

Before implementing any UI, adhere to these key principles:

1.  **Corner Radius**: Always use **`rounded-sm`**. Avoid `rounded-lg` or `rounded-md` to maintain a sharp, technical aesthetic.
2.  **Color Usage**:
    - **Avoid `nasun-c3` (Teal)**: Use `nasun-c4` (Blue) or `nasun-c1` (Gold) for interactive elements.
    - **Box Themes**: Prefer `w1`, `w2`, `w3`, `w4`, `w5` variants for `OuterBox` and `DividerBox`. These are the primary color props to use.
3.  **Responsive Spacing**: Use the 3-step scale (`mobile -> md -> lg`) for all gaps and margins.
4.  **Text Hierarchy**: Use `nasun-white` for emphasis and `nasun-white/80` for body text.

---

## 2. Page Layout Structure

### 2.1 Container

All main content pages must use the `SectionLayout` wrapper.

- **Component**: `<SectionLayout>`
- **Max Width**: `max-w-6xl` (1152px) via `className="!max-w-6xl"`
- **Padding**: Use `!pt-0` if the section starts immediately after the header.

### 2.2 Grid & Spacing System (Strict Rules)

**A. Vertical Spacing (Between Sections)**
Use `flex flex-col` on the parent container.

```tsx
<div className="flex flex-col gap-6 md:gap-8 lg:gap-10">{/* Sections go here */}</div>
```

**B. Content Spacing (Inside Sections)**
Spacing between paragraphs (`p`) or internal blocks.

```tsx
<div className="space-y-2 md:space-y-3 lg:space-y-4">
  <p>...</p>
</div>
```

**C. Grid Layouts**
Standard grids for cards and boxes.

```tsx
// Standard 2-Column
<div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">

// Dashboard 3-Column (Bento)
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

// 50/50 Split
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
```

---

## 3. Color System

### Brand Colors

| Name          | HEX       | Tailwind Class                           | Usage                     |
| ------------- | --------- | ---------------------------------------- | ------------------------- |
| nasun-white   | `#faf7f4` | `text-nasun-white`, `bg-nasun-white`     | Primary text, backgrounds |
| nasun-black   | `#191615` | `text-nasun-black`, `bg-nasun-black`     | Dark backgrounds          |
| nasun-gray    | `#242424` | `bg-nasun-gray`                          | Dark UI components        |
| nasun-scarlet | `#fa3102` | `text-nasun-scarlet`, `bg-nasun-scarlet` | Warning, alerts           |

### Palette Colors

| Name       | Usage                                        | Status                    |
| ---------- | -------------------------------------------- | ------------------------- |
| `nasun-c1` | Gold/amber - rewards, highlights             | ✅ Active                 |
| `nasun-c2` | Light yellow - secondary highlights          | ✅ Active                 |
| `nasun-c3` | Teal/cyan                                    | **⚠️ DEPRECATED (Avoid)** |
| `nasun-c4` | Blue - interactive elements, primary buttons | ✅ Active                 |
| `nasun-c5` | Deep blue - borders, secondary elements      | ✅ Active                 |
| `nasun-c6` | Navy - dark containers, sidebars             | ✅ Active                 |

### Text Opacity Levels

```css
text-nasun-white           /* 100% - Headings, important values */
text-nasun-white/90        /* 90% - Body text */
text-nasun-white/85        /* 85% - Description text */
text-nasun-white/60        /* 60% - Labels, captions */
text-nasun-white/40        /* 40% - Subtle hints */
```

### Background Opacity Patterns

```css
bg-nasun-black             /* Main page background */
bg-gray-800/80             /* Inner cards, stat boxes */
bg-gray-800/30             /* Default card background */
bg-nasun-c6/90             /* OuterBox default */
bg-nasun-gray/70           /* DividerBox w1 variant */
bg-nasun-c4/20             /* Active/Logged-in badge */
```

---

## 4. Typography

### Font Families

- **English**: Rubik
- **Korean**: Pretendard
- **Special**: Founders Grotesk (`font-founders`), Eurostile (`font-eurostile`)

### Heading Styles (Global)

Headings are strictly typed in `index.css`. Do not override sizes manually unless necessary.

```css
h1: text-4xl/tight md:text-5xl/tight lg:text-6xl/tight
h2: text-3xl/tight md:text-4xl/tight lg:text-5xl/tight
h3: text-2xl/tight md:text-3xl/tight lg:text-4xl/tight
h4: text-xl/tight md:text-2xl/tight lg:text-3xl/tight
```

### Text Styling Rules

- **Emphasis**: Use `<strong className="text-nasun-white font-medium" />` inside `Trans`.
- **Brand Emphasis**: Use `text-nasun-c1` for key metrics or brand terms.
- **Introduction Text**: `text-lg font-light leading-relaxed text-nasun-white/90`.
- **Lists**:
  ```tsx
  <ul className="list-disc pl-6 space-y-2 marker:text-nasun-c1">
    <li>List item</li>
  </ul>
  ```

### Title Components

**PageTitle** (H2)

```tsx
<PageTitle as="h2" align="center">
  PAGE TITLE
</PageTitle>
// Style: normal-case, font-normal, tracking-wide
```

**SectionTitle** (H3/H4)

```tsx
<SectionTitle as="h3" color="white" className="text-center">
  Section Title
</SectionTitle>
```

---

## 5. Component Library

### 5.1 Buttons (`Button`)

| Variant       | Usage              | Style                              |
| ------------- | ------------------ | ---------------------------------- |
| `c4`          | **Primary Action** | Blue solid (`bg-nasun-c4`)         |
| `green`       | Success/Confirm    | Green solid (`bg-green-500`)       |
| `destructive` | Danger/Delete      | Red solid (`bg-red-500`)           |
| `outlineC5`   | Secondary          | Blue outline (`ring-nasun-c5`)     |
| `ghost`       | Tertiary           | Text only (`hover:bg-nasun-c5/20`) |

**Standard Layout**:

```tsx
<div className="flex w-fit items-center gap-2 mt-6 mx-auto">
  <Button variant="c1" size="lg">
    Action
  </Button>
</div>
```

### 5.2 Boxes & Containers

**Corner Radius Rule**: Use `rounded-sm` everywhere.

**Color Rule**: `nasun-c3` (Teal) 사용을 지양합니다. 인터랙티브 요소에는 `nasun-c4` (Blue) 또는 `nasun-c1` (Gold)을 사용하고, Box 컴포넌트에는 `w1`~`w5` variant를 우선 사용하세요.

#### OuterBox

For large container boxes/sections.

- **Recommended Props**: `color="w1"` ~ `color="w5"` (preferred over other color variants)
- **Padding**: `padding="md"` (24px-32px)

#### DividerBox

For content groups with a title and divider.

- **Recommended Props**: `color="w1"` ~ `color="w5"` (preferred over other color variants)
- **Padding**: `padding="sm"` (16px-24px)
- **Title Style**: Use `titleClassName="!text-nasun-c1"` if emphasis is needed.

#### Wave Variant Reference

| Variant | Background         | Border                  | Usage                  |
| ------- | ------------------ | ----------------------- | ---------------------- |
| `w1`    | `bg-nasun-gray/70` | `border-nasun-white/40` | Default wave section   |
| `w2`    | `bg-[#212E57]/50`  | `border-nasun-c4/50`    | Nasun Network section  |
| `w3`    | `bg-nasun-c4/90`   | `border-nasun-white/50` | Nasun Token section    |
| `w4`    | `bg-nasun-gray/70` | `border-nasun-white/40` | Gold text variant (c1) |
| `w5`    | `bg-[#3D3D3D]`     | `border-nasun-white/40` | Neutral dark card      |

### 5.3 Cards (`DashboardCard`)

| Variant   | Style                                    |
| --------- | ---------------------------------------- |
| `default` | `bg-gray-800/30 border-nasun-c5/40`      |
| `hero`    | Gradient background (`nasun-c6` to `c3`) |
| `compact` | Minimal styling (`bg-nasun-c6/30`)       |
| `danger`  | Red background (`bg-red-950/30`)         |

### 5.4 Form Elements

All form inputs use `rounded-sm`.

```tsx
// Input
<input className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 focus:border-nasun-c4/50" />

// Select
<select className="bg-nasun-c6 border border-nasun-c5/50 rounded-sm" />
```

---

## 6. Cheatsheet

```
+==================================================================+
| LAYOUT & SPACING                                                 |
+==================================================================+
| Wrapper              | <SectionLayout className="!max-w-6xl">   |
| Vertical Gap         | flex-col gap-6 md:gap-8 lg:gap-10        |
| Content Gap          | space-y-2 md:space-y-3 lg:space-y-4      |
| Grid                 | grid-cols-1 md:grid-cols-2 gap-6         |
| Corner Radius        | rounded-sm (Strict)                      |
+==================================================================+
| COLORS & THEMES                                                  |
+==================================================================+
| Primary Action       | nasun-c4 (Blue)                          |
| Highlights           | nasun-c1 (Gold)                          |
| Box Themes           | w1, w2, w3, w4, w5 (preferred)           |
| Avoid                | nasun-c3 (Teal)                          |
+==================================================================+
| COMPONENTS                                                       |
+==================================================================+
| Main Button          | <Button variant="c4" size="lg">          |
| Section Box          | <OuterBox color="w1" padding="md">       |
| Info Card            | <DividerBox color="w2" padding="sm">     |
| Inner Stat           | bg-gray-800/80 rounded-sm p-3            |
+==================================================================+
```
