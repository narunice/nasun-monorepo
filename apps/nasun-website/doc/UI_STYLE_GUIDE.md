# Nasun UI Style Guide

> Reference: My Account Dashboard Design (2026-01)

This document defines the standard UI styling patterns for the Nasun Website.
All new components should follow these guidelines to ensure design consistency.

---

## Table of Contents

1. [Color System](#color-system)
2. [Card Components](#card-components)
3. [Typography](#typography)
4. [Buttons & Badges](#buttons--badges)
5. [Form Elements](#form-elements)
6. [Spacing & Layout](#spacing--layout)
7. [Interactive States](#interactive-states)
8. [Component Examples](#component-examples)

---

## Color System

### Brand Colors (Tailwind)

| Name | Class | Usage |
|------|-------|-------|
| nasun-c3 | `text-nasun-c3`, `bg-nasun-c3` | Success, positive actions, links |
| nasun-c4 | `text-nasun-c4`, `bg-nasun-c4` | Interactive elements (hover) |
| nasun-c5 | `text-nasun-c5`, `bg-nasun-c5` | Borders, secondary elements |
| nasun-c6 | `text-nasun-c6`, `bg-nasun-c6` | Dark containers, backgrounds |
| nasun-white | `text-nasun-white` | Primary text |
| nasun-black | `text-nasun-black` | Light mode text |

### Text Opacity Levels

```css
/* Primary text */
text-nasun-white           /* 100% - Headings, important values */

/* Secondary text */
text-nasun-white/90        /* 90% - Body text, usernames */
text-nasun-white/80        /* 80% - Secondary content */

/* Tertiary text */
text-nasun-white/60        /* 60% - Labels, captions */
text-nasun-white/50        /* 50% - Placeholder, disabled */
text-nasun-white/40        /* 40% - Subtle hints */
```

### Background Opacity Levels

```css
/* Cards and containers */
bg-gray-800/80             /* Inner cards, stat boxes */
bg-gray-800/30             /* Default card background */
bg-nasun-c6/50             /* Hero card gradient start */
bg-nasun-c6/30             /* Compact card background */

/* Status backgrounds */
bg-green-500/20            /* Success badge */
bg-red-500/20              /* Error badge */
bg-red-950/30              /* Danger zone background */
bg-nasun-c3/20             /* Active/logged-in badge */
```

---

## Card Components

### DashboardCard Variants

#### Default Card
```tsx
className="bg-gray-800/30 border border-nasun-c5/40 hover:border-nasun-c5/50 rounded-xl p-4 lg:p-6 transition-all duration-200"
```

#### Hero Card (Featured content)
```tsx
className="bg-gradient-to-br from-nasun-c6/50 to-nasun-c3/5 border border-nasun-c3/40 rounded-xl p-4 lg:p-6"
```

#### Compact Card
```tsx
className="bg-nasun-c6/30 border border-nasun-c5/20 rounded-xl p-4 lg:p-6"
```

#### Danger Card
```tsx
className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 lg:p-6"
```

### StatCard (Inside cards)
```tsx
className="bg-gray-800/80 rounded-lg p-3 lg:p-4 text-center"
```

### Inner Content Card
```tsx
className="bg-gray-800/80 rounded-lg p-3"
```

---

## Typography

### Card Title (h5)
```tsx
<h5 className="uppercase text-nasun-white mb-4">CARD TITLE</h5>
```

### Section Title (h6)
```tsx
<h6 className="font-medium text-nasun-white/60 uppercase">Section Title</h6>
```

### Stat Label
```tsx
<span className="text-sm font-light text-nasun-white/60 uppercase tracking-wide">Label</span>
```

### Stat Value
```tsx
<span className="text-lg font-bold text-nasun-white">Value</span>
```

### Body Text
```tsx
<p className="text-nasun-white/80">Main content text</p>
```

### Description/Helper Text
```tsx
<p className="text-nasun-white/50">Description or helper text</p>
```

### Truncated Text
```tsx
<span className="truncate max-w-[150px] text-nasun-white/80">Long text...</span>
```

---

## Buttons & Badges

### Status Badges

#### Success/Yes Badge
```tsx
<span className="px-2 py-0.5 rounded text-sm font-medium bg-green-500/20 text-green-400">
  Yes
</span>
```

#### Error/No Badge
```tsx
<span className="px-2 py-0.5 rounded text-sm font-medium bg-red-500/20 text-red-400">
  No
</span>
```

#### Active/Logged-in Badge
```tsx
<span className="text-sm text-nasun-c3 bg-nasun-c3/20 px-2 py-0.5 rounded whitespace-nowrap">
  Logged in
</span>
```

### Link Buttons
```tsx
<Link className="text-nasun-c3 hover:text-nasun-c4 transition-colors">
  View All →
</Link>
```

### Card Footer Link
```tsx
<Link className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-nasun-c5/30 text-nasun-c3 hover:text-nasun-c4 transition-colors">
  View All
  <ChevronRightIcon />
</Link>
```

---

## Form Elements

### Input Field (Inside dark card)
```tsx
<input className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-lg px-3 py-2 text-nasun-white placeholder:text-nasun-white/40 focus:outline-none focus:border-nasun-c3/50" />
```

### Select Dropdown Background
```tsx
className="bg-nasun-c6 border border-nasun-c5/50 rounded-lg"
```

---

## Spacing & Layout

### Card Padding
```css
p-4 lg:p-6                 /* Standard card padding */
p-3                        /* Inner card/stat padding */
p-3 lg:p-4                 /* Responsive inner padding */
```

### Card Gaps
```css
gap-3                      /* Between stat cards */
gap-4                      /* Between inner sections */
gap-4 lg:gap-6             /* Between grid cards */
```

### Margins
```css
mb-4                       /* After card title */
mb-3                       /* After stat label */
mt-4                       /* Before footer link */
```

### Grid Layouts

#### Bento Grid (Dashboard)
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
```

#### Stats Grid (2 columns)
```tsx
<div className="grid grid-cols-2 gap-3">
```

#### 50/50 Split
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
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
```

### Focus States
```css
focus:outline-none focus:border-nasun-c3/50
```

### Loading Spinner
```tsx
<div className="animate-spin rounded-full h-6 w-6 border-2 border-nasun-c3 border-t-transparent" />
```

---

## Component Examples

### Dropdown Menu (Radix UI)
```tsx
<DropdownMenu.Content className="min-w-[180px] bg-nasun-c6 border border-nasun-c5/50 rounded-lg p-1 shadow-lg z-50">
  <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm text-nasun-white rounded cursor-pointer outline-none hover:bg-nasun-c5/30 focus:bg-nasun-c5/30">
    Item Text
  </DropdownMenu.Item>
  <DropdownMenu.Separator className="h-px bg-nasun-c5/30 my-1" />
  <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 rounded cursor-pointer outline-none hover:bg-red-950/30 focus:bg-red-950/30">
    Danger Item
  </DropdownMenu.Item>
</DropdownMenu.Content>
```

### Tooltip (Radix UI)
```tsx
<Tooltip.Content className="max-w-[280px] px-3 py-2 bg-gray-300 text-nasun-black/70 text-xs border border-gray-500 rounded-lg shadow-lg z-50">
  Tooltip text content
  <Tooltip.Arrow className="fill-gray-300" />
</Tooltip.Content>
```

### Error Banner
```tsx
<div className="mb-4 p-2 bg-red-900/30 text-red-300 text-sm rounded-lg">
  Error message
</div>
```

### Social Account Item
```tsx
<div className="flex items-center gap-2 py-2 px-3 bg-gray-800/80 rounded-lg">
  <Icon />
  <span className="text-nasun-white">Label</span>
  <span className="text-nasun-white/60 truncate max-w-[120px]">Value</span>
  <span className="text-green-400">✓</span>
  <div className="flex-1" />
  <Button size="xs">Action</Button>
</div>
```

---

## File References

| Component | Path |
|-----------|------|
| DashboardCard | `src/components/ui/DashboardCard.tsx` |
| StatCard | `src/components/ui/StatCard.tsx` |
| ProfileHeroCard | `src/components/app/myAccount/ProfileHeroCard.tsx` |
| GovernanceCard | `src/components/app/myAccount/GovernanceCard.tsx` |
| WalletConnectionBar | `src/components/app/myAccount/WalletConnectionBar.tsx` |
| DangerZoneCard | `src/components/app/myAccount/DangerZoneCard.tsx` |

---

## Quick Reference Cheatsheet

```
╔══════════════════════════════════════════════════════════════════╗
║ BACKGROUNDS                                                      ║
╠══════════════════════════════════════════════════════════════════╣
║ Card (default)     │ bg-gray-800/30 border-nasun-c5/40          ║
║ Card (hero)        │ bg-gradient from-nasun-c6/50 to-nasun-c3/5 ║
║ Card (danger)      │ bg-red-950/30 border-red-900/50            ║
║ Inner box          │ bg-gray-800/80 rounded-lg                  ║
║ Dropdown           │ bg-nasun-c6 border-nasun-c5/50             ║
╠══════════════════════════════════════════════════════════════════╣
║ TEXT                                                             ║
╠══════════════════════════════════════════════════════════════════╣
║ Title (h5)         │ uppercase text-nasun-white                 ║
║ Label              │ text-sm text-nasun-white/60 uppercase      ║
║ Value              │ text-lg font-bold text-nasun-white         ║
║ Description        │ text-nasun-white/50                        ║
║ Link               │ text-nasun-c3 hover:text-nasun-c4          ║
╠══════════════════════════════════════════════════════════════════╣
║ BADGES                                                           ║
╠══════════════════════════════════════════════════════════════════╣
║ Success            │ bg-green-500/20 text-green-400             ║
║ Error              │ bg-red-500/20 text-red-400                 ║
║ Active             │ bg-nasun-c3/20 text-nasun-c3               ║
╠══════════════════════════════════════════════════════════════════╣
║ SPACING                                                          ║
╠══════════════════════════════════════════════════════════════════╣
║ Card padding       │ p-4 lg:p-6                                 ║
║ Inner padding      │ p-3                                        ║
║ Grid gap           │ gap-4 lg:gap-6                             ║
║ Title margin       │ mb-4                                       ║
╚══════════════════════════════════════════════════════════════════╝
```

---

*Last updated: 2026-01-02*
