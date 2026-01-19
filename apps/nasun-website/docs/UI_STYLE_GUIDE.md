# Nasun UI Style Guide

> Reference: Nasun Website Frontend (2026-01)

This document defines the standard UI styling patterns for the Nasun Website.
All new components should follow these guidelines to ensure design consistency.

---

## Table of Contents

1. [Color System](#color-system)
2. [Typography](#typography)
3. [Card Components](#card-components)
4. [Buttons](#buttons)
5. [Box Components](#box-components)
6. [Form Elements](#form-elements)
7. [Spacing & Layout](#spacing--layout)
8. [Interactive States](#interactive-states)
9. [Loading & Animations](#loading--animations)
10. [Component Reference](#component-reference)

---

## Color System

### Brand Colors

| Name | HEX | Tailwind Class | Usage |
|------|-----|----------------|-------|
| nasun-white | `#faf7f4` | `text-nasun-white`, `bg-nasun-white` | Primary text, backgrounds |
| nasun-black | `#191615` | `text-nasun-black`, `bg-nasun-black` | Dark backgrounds, light mode text |
| nasun-gray | `#242424` | `bg-nasun-gray` | Dark UI components |
| nasun-scarlet | `#fa3102` | `text-nasun-scarlet`, `bg-nasun-scarlet` | Warning, alerts, emphasis |
| nasun-coral | `#FF4D4D` | `text-nasun-coral`, `bg-nasun-coral` | Sub point color |

### Palette Colors (c1-c6)

| Name | HEX | Usage |
|------|-----|-------|
| nasun-c1 | `#f9a824` | Gold/amber - rewards, highlights |
| nasun-c2 | `#f6e5a2` | Light yellow - secondary highlights |
| nasun-c3 | `#94e1d3` | Teal/cyan - success, positive, CTAs |
| nasun-c4 | `#448BBB` | Blue - interactive elements, primary buttons |
| nasun-c5 | `#2A64C5` | Deep blue - borders, secondary elements |
| nasun-c6 | `#1b374a` | Navy - dark containers, sidebars |

### Text Opacity Levels

```css
/* Primary text */
text-nasun-white           /* 100% - Headings, important values */

/* Secondary text */
text-nasun-white/90        /* 90% - Body text */
text-nasun-white/85        /* 85% - Description text */
text-nasun-white/80        /* 80% - Secondary content */

/* Tertiary text */
text-nasun-white/70        /* 70% - Helper text */
text-nasun-white/60        /* 60% - Labels, captions */
text-nasun-white/50        /* 50% - Placeholder, disabled */
text-nasun-white/40        /* 40% - Subtle hints */
```

### Background Opacity Patterns

```css
/* Page backgrounds */
bg-nasun-black             /* Main page background */

/* Cards and containers */
bg-gray-800/80             /* Inner cards, stat boxes */
bg-gray-800/30             /* Default card background */
bg-nasun-c6/90             /* OuterBox default */
bg-nasun-c6/40             /* Admin sidebar */
bg-nasun-gray/70           /* DividerBox w1 variant */

/* Status backgrounds */
bg-green-500/20            /* Success badge */
bg-red-500/20              /* Error badge */
bg-red-950/30              /* Danger zone */
bg-nasun-c3/20             /* Active/logged-in badge */
```

---

## Typography

### Global Heading Styles (index.css)

Typography sizes are defined globally and follow responsive patterns:

```css
h1: text-4xl/tight md:text-5xl/tight lg:text-6xl/tight
h2: text-3xl/tight md:text-4xl/tight lg:text-5xl/tight
h3: text-2xl/tight md:text-3xl/tight lg:text-4xl/tight
h4: text-xl/tight md:text-2xl/tight lg:text-3xl/tight
h5: text-lg/tight md:text-xl/tight lg:text-2xl/tight
h6: text-base/tight md:text-lg/tight lg:text-xl/tight
p:  text-sm/snug md:text-base/snug xl:text-lg/snug (font-light, text-nasun-white/80)
```

### Font Families

| Language | Headings | Body |
|----------|----------|------|
| English | Rubik | Rubik |
| Korean | Pretendard | Pretendard |

Special fonts:
- `font-founders` - Founders Grotesk (special titles)
- `font-eurostile` - Eurostile Extended (section headings)

### Title Components

**PageTitle** - Page top-level title
```tsx
<PageTitle as="h2" align="center">
  PAGE TITLE
</PageTitle>
// Uses: mt-12 mb-6 md:mb-8 lg:mb-10 xl:mb-12, uppercase font-medium
```

**SectionTitle** - Section title
```tsx
<SectionTitle as="h3" color="white" className="text-center">
  Section Title
</SectionTitle>
// Uses: mb-2 md:mb-3 lg:mb-4
```

### Admin Page Titles

Admin pages use simple h2 tags following global CSS:
```tsx
<h2 className="text-nasun-white uppercase mb-4">
  Admin Dashboard
</h2>
```

---

## Card Components

### DashboardCard Variants

```tsx
// Default - Standard card with hover
variant="default"
// bg-gray-800/30 border-nasun-c5/40 hover:border-nasun-c5/50

// Hero - Featured content with gradient
variant="hero"
// bg-gradient-to-br from-nasun-c6/50 to-nasun-c3/5 border-nasun-c3/40

// Compact - Minimal styling
variant="compact"
// bg-nasun-c6/30 border-nasun-c5/20

// Danger - Warning/destructive
variant="danger"
// bg-red-950/30 border-red-900/50
```

### StatCard (Inside cards)
```tsx
className="bg-gray-800/80 rounded-lg p-3 lg:p-4 text-center"
```

---

## Buttons

### Button Variants

**Solid Colors:**
| Variant | Style |
|---------|-------|
| `default` | bg-nasun-black/90 text-nasun-white |
| `defaultReverse` | bg-nasun-white/70 text-nasun-black |
| `scarlet` | bg-nasun-scarlet text-nasun-white |
| `c1` | bg-nasun-c1 text-nasun-black |
| `c2` | bg-nasun-c2 text-nasun-black |
| `c3` | bg-nasun-c3 text-nasun-black |
| `c4` | bg-nasun-c4 text-nasun-white |
| `c5` | bg-nasun-c5 text-nasun-white |
| `green` | bg-green-500 text-white |
| `destructive` | bg-red-500 text-white |

**Outline Variants:**
| Variant | Style |
|---------|-------|
| `outlineC3` | ring-nasun-c3 bg-transparent text-nasun-c3 |
| `outlineC4` | ring-nasun-c4 bg-transparent text-nasun-c4 |
| `outlineC5` | ring-nasun-c5 bg-transparent text-nasun-c5 |
| `outlineScarlet` | ring-nasun-scarlet bg-transparent text-nasun-scarlet |

**Filled Outline Variants:**
| Variant | Style |
|---------|-------|
| `filledOutlineC3` | ring-nasun-c3 bg-nasun-c3/10 text-nasun-c3 |
| `filledOutlineC4` | ring-nasun-c4 bg-nasun-c4/10 text-nasun-c4 |

**Special:**
| Variant | Style |
|---------|-------|
| `ghost` | text-nasun-white hover:bg-nasun-c5/20 |
| `link` | text-nasun-white/80 underline |
| `action` | bg-nasun-c4/20 text-white (for dark backgrounds) |

### Button Sizes

| Size | Padding/Font |
|------|--------------|
| `xs` | text-xs px-5 py-1 |
| `sm` | text-xs lg:text-sm px-4 lg:px-5 py-1 |
| `default` | text-xs lg:text-sm px-4 lg:px-5 py-1 lg:py-[6px] |
| `md` | text-sm lg:text-base px-5 lg:px-6 py-1 lg:py-[6px] |
| `lg` | text-base lg:text-lg px-6 lg:px-8 py-[6px] lg:py-2 |
| `xl` | text-lg lg:text-xl px-8 lg:px-10 py-2 |
| `2xl` | text-lg lg:text-xl px-8 lg:px-12 py-2 lg:py-3 |
| `hero` | text-2xl md:text-2xl w-full py-3 |

---

## Box Components

### OuterBox Color Variants

OuterBox is for large container boxes:

| Color | Border + Background |
|-------|---------------------|
| `default` | border-nasun-c5/50 bg-nasun-c6/90 |
| `n1` | border-nasun-white/40 bg-nasun-white/5 |
| `n2` | border-nasun-white/10 bg-gray-800 |
| `n3` | border-nasun-c5/40 bg-gray-800/30 |
| `n4` | border-nasun-c4/50 bg-nasun-c4/10 |
| `n5` | border-nasun-c3/40 bg-gradient-to-br from-nasun-c6/50 to-nasun-c3/5 |
| `w1` | border-nasun-white/40 bg-nasun-gray/70 |
| `c1`-`c6` | Each color's border/bg combination |
| `scarlet` | border-nasun-scarlet/50 bg-[#320900]/90 |

### DividerBox Color Variants

DividerBox includes title + divider:

| Color | Usage |
|-------|-------|
| `white` | General info box |
| `c1`-`c6` | Brand color emphasis |
| `n1`-`n5` | Neutral colors |
| `w1` | Light background emphasis |
| `green` | Success/confirmation |
| `scarlet` | Warning/caution |

### Padding Variants

```tsx
padding="md"  // px-4 md:px-6 lg:px-8 py-3 md:py-5 lg:py-7
padding="sm"  // px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5
```

---

## Form Elements

### Input Field
```tsx
<input className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-lg px-4 py-3 text-nasun-white placeholder:text-nasun-white/40 focus:outline-none focus:border-nasun-c3/50 transition-colors" />
```

### Date Input (Admin)
```tsx
<input type="date" className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-lg px-4 py-3 text-nasun-white focus:outline-none focus:border-nasun-c3/50 transition-colors" />
```

### Select Dropdown
```tsx
className="bg-nasun-c6 border border-nasun-c5/50 rounded-lg"
```

---

## Spacing & Layout

### Card Padding
```css
p-4 lg:p-6                 /* Standard card */
p-3                        /* Inner card/stat */
p-8                        /* Admin main content */
```

### Section Gaps
```css
gap-4 md:gap-6 lg:gap-8    /* Between sections */
gap-6 md:gap-8 lg:gap-10   /* Large sections */
space-y-4 md:space-y-6     /* Vertical stacking */
```

### Grid Layouts

```tsx
// Bento Grid (Dashboard)
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

// Stats Grid (2 columns)
<div className="grid grid-cols-2 gap-3">

// 50/50 Split
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
```

### Admin Layout

```tsx
// Main layout
<div className="min-h-screen bg-nasun-black flex pt-20">
  // Sidebar
  <aside className="w-64 bg-nasun-c6/40 border-r border-white/10 fixed top-20 left-0 bottom-0">
  // Main content
  <main className="flex-1 overflow-auto ml-64">
    <div className="p-8">
```

---

## Interactive States

### Hover Transitions
```css
transition-all duration-200     /* Card hover */
transition-colors               /* Text/link hover */
```

### Border Hover
```css
border-nasun-c5/40 hover:border-nasun-c5/50
border-nasun-c5/50 hover:border-nasun-c5/80
```

### Active Navigation
```tsx
isActive ? 'bg-nasun-c4 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
```

### Focus States
```css
focus:outline-none focus:border-nasun-c3/50
focus-visible:ring-2 focus-visible:ring-gray-600
```

---

## Loading & Animations

### Loading Spinner
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c3 border-t-transparent" />
```

### Skeleton Loading
```tsx
<div className="animate-pulse">
  <div className="h-4 bg-nasun-c5/20 rounded w-1/3 mb-4"></div>
  <div className="h-8 bg-nasun-c5/20 rounded w-1/2"></div>
</div>
```

### Pulse Animation (Active indicator)
```tsx
<span className="text-nasun-c3 text-xs font-medium animate-pulse-subtle">Active</span>
```

### Custom Scrollbar
```css
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: linear-gradient(90deg, rgba(148, 225, 211, 0.4), rgba(61, 126, 169, 0.4));
}
```

### Button Glow Effect
```tsx
className="btn-glow"
// Animated conic-gradient border on hover
```

---

## Component Reference

### UI Components

| Component | Path | Description |
|-----------|------|-------------|
| Button | `src/components/ui/button.tsx` | Configurable button with variants |
| buttonVariants | `src/components/ui/button-variants.ts` | CVA button styles |
| DashboardCard | `src/components/ui/DashboardCard.tsx` | Dashboard card variants |
| OuterBox | `src/components/ui/OuterBox.tsx` | Large container box |
| DividerBox | `src/components/ui/DividerBox.tsx` | Card with title divider |
| PageTitle | `src/components/ui/PageTitle.tsx` | Page-level title |
| SectionTitle | `src/components/ui/SectionTitle.tsx` | Section-level title |
| StatCard | `src/components/ui/StatCard.tsx` | Stat display card |

### Layout Components

| Component | Path | Description |
|-----------|------|-------------|
| SectionLayout | `src/components/layout/SectionLayout.tsx` | Section wrapper |
| AdminLayout | `src/features/admin/components/AdminLayout.tsx` | Admin page layout |
| Footer | `src/components/layout/Footer.tsx` | Site footer |
| Navbar | `src/components/navbar/Navbar.tsx` | Navigation bar |

### Style Files

| File | Description |
|------|-------------|
| `src/index.css` | Global styles, fonts, typography |
| `tailwind.config.js` | Tailwind configuration |
| `packages/tailwind-config/colors.js` | Shared color palette |
| `packages/tailwind-config/base.js` | Shared Tailwind config |

---

## Quick Reference Cheatsheet

```
+==================================================================+
| BACKGROUNDS                                                      |
+==================================================================+
| Page background      | bg-nasun-black                           |
| Card (default)       | bg-gray-800/30 border-nasun-c5/40        |
| Card (hero)          | bg-gradient from-nasun-c6/50 to-c3/5     |
| Card (danger)        | bg-red-950/30 border-red-900/50          |
| Inner box            | bg-gray-800/80 rounded-lg                |
| Admin sidebar        | bg-nasun-c6/40 border-white/10           |
| OuterBox default     | bg-nasun-c6/90 border-nasun-c5/50        |
+==================================================================+
| TEXT                                                             |
+==================================================================+
| Heading              | text-nasun-white uppercase               |
| Body                 | text-nasun-white/80 font-light           |
| Label                | text-nasun-white/60 text-sm uppercase    |
| Description          | text-nasun-white/50                      |
| Link                 | text-nasun-c3 hover:text-nasun-c4        |
+==================================================================+
| BADGES                                                           |
+==================================================================+
| Success              | bg-green-500/20 text-green-400           |
| Error                | bg-red-500/20 text-red-400               |
| Active               | bg-nasun-c3/20 text-nasun-c3             |
+==================================================================+
| BUTTONS (Primary)                                                |
+==================================================================+
| Primary action       | variant="c4" (blue solid)                |
| Success action       | variant="c3" (teal solid)                |
| Secondary            | variant="outlineC5" (blue outline)       |
| Danger               | variant="destructive" (red solid)        |
+==================================================================+
| SPACING                                                          |
+==================================================================+
| Card padding         | p-4 lg:p-6                               |
| Inner padding        | p-3                                      |
| Section gap          | gap-6 md:gap-8 lg:gap-10                 |
| Title margin         | mb-4                                     |
+==================================================================+
```

---

*Last updated: 2026-01-19*
