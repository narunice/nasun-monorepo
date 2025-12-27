# Nasun Explorer UI Styling Guide

> Version: 1.0.0
> Last Updated: 2025-12-15
> Reference: nasun-website design system

---

## Color Palette

### Base Colors
| Name | Hex | Usage |
|------|-----|-------|
| nasun-white | `#faf7f4` | Primary text, warm white |
| nasun-black | `#191615` | Background, warm dark |

### Brand Colors (c1~c6)
| Name | Hex | Usage |
|------|-----|-------|
| nasun-c1 | `#f9a824` | Warning, highlight (gold/yellow) |
| nasun-c2 | `#f6e5a2` | Light accent (cream) |
| nasun-c3 | `#94e1d3` | Success, positive (teal/mint) |
| nasun-c4 | `#448BBB` | Primary interactive (blue) |
| nasun-c5 | `#2A64C5` | Secondary interactive (deep blue) |
| nasun-c6 | `#1b374a` | Dark containers (navy) |

### Color Usage Rules

⚠️ **Do NOT use in actual UI:**
- `nasun-scarlet` (#fa3102) - Red colors appear as errors
- `nasun-coral` (#FF4D4D) - Same reason as scarlet

These colors are available as component variant options for code reusability, but should not be applied in the Explorer UI.

**Recommended for Explorer:**
- Primary actions: `c4` (blue)
- Secondary/hover: `c5` (deep blue)
- Containers: `c6` (navy)
- Success states: `c3` (teal)
- Highlight/attention: `c1` (gold)

---

## Component Patterns

### Card

Container for grouped content with consistent styling.

```tsx
// Variants
const variants = {
  default: 'bg-nasun-c6/90 border-nasun-c5/50',
  c3: 'bg-nasun-c3/10 border-nasun-c3/50',
  c4: 'bg-nasun-c4/10 border-nasun-c4/50',
  c5: 'bg-nasun-c5/10 border-nasun-c5/50',
  gradient: 'bg-gradient-to-r from-nasun-c5/20 to-nasun-c4/40 border-nasun-c4/50',
};

// Base styles
const baseStyles = `
  rounded-xl
  border
  backdrop-blur-md
  shadow-lg
  transition-all
  hover:shadow-xl
  hover:scale-[1.01]
`;
```

**Usage:**
```tsx
<Card variant="c4">
  <h3>Card Title</h3>
  <p>Card content goes here</p>
</Card>
```

---

### SectionBox

Section container with optional title and divider.

```tsx
// Color styles
const colorStyles = {
  c3: { border: 'border-nasun-c3', bg: 'bg-nasun-c3/10', text: 'text-nasun-c3' },
  c4: { border: 'border-nasun-c4', bg: 'bg-nasun-c4/10', text: 'text-nasun-c4' },
  c5: { border: 'border-nasun-c5', bg: 'bg-nasun-c5/10', text: 'text-nasun-c5' },
};

// Base styles
const baseStyles = `
  p-4 md:p-6
  rounded-lg
  border
  backdrop-blur-md
  backdrop-brightness-50
`;
```

**Usage:**
```tsx
<SectionBox title="Transaction History" color="c4">
  {/* Content */}
</SectionBox>
```

---

### Table

Data tables with consistent styling.

```tsx
// Container
<div className="rounded-xl overflow-hidden border border-nasun-c4/50 bg-gray-900/80">
  <table className="w-full">...</table>
</div>

// Header row
<thead>
  <tr className="bg-nasun-c6/80">
    <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">
      Column
    </th>
  </tr>
</thead>

// Body row
<tr className="border-b border-nasun-c4/20 hover:bg-nasun-c6/50 hover:scale-[1.01] transition-all">
  <td className="px-4 py-3 text-nasun-white/80">Data</td>
</tr>
```

---

### Button

Interactive buttons with nasun styling.

```tsx
// Base styles
const buttonBase = `
  inline-flex items-center justify-center
  rounded-3xl
  leading-normal
  active:scale-[0.97]
  transition-all
  duration-200
`;

// Variants
const variants = {
  default: 'bg-gray-800/60 text-nasun-white border border-nasun-white/50 hover:bg-gray-800',
  c4: 'bg-nasun-c4 text-nasun-white hover:brightness-110',
  c5: 'bg-nasun-c5 text-nasun-white hover:brightness-110',
  outline: 'border border-nasun-c4 text-nasun-c4 hover:bg-nasun-c4/10',
  ghost: 'text-nasun-white/70 hover:bg-nasun-white/10',
};

// Sizes
const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  default: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg',
};
```

---

## Animation & Effects

### Transitions
- Default: `transition-all duration-200`
- Hover scale: `hover:scale-[1.01]`
- Active scale: `active:scale-[0.97]`

### Backdrop Effects
```css
/* Glassmorphism */
.glass {
  backdrop-blur-md;
  backdrop-brightness-50;
}
```

### Pulse Animation
```css
/* Subtle pulse for loading states */
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}
.animate-pulse-subtle {
  animation: pulse-subtle 2s ease-in-out infinite;
}
```

---

## Spacing Guidelines

### Padding
- Cards: `p-4 md:p-6`
- Table cells: `px-4 py-3`
- Buttons: `px-4 py-2` (default)

### Margins
- Section gaps: `mb-6` or `mb-8`
- Element gaps: `gap-4`

### Border Radius
- Cards: `rounded-xl` (0.75rem)
- Buttons: `rounded-3xl` (1.5rem)
- Small elements: `rounded-lg` (0.5rem)

---

## Typography

### Font Weights
- Normal text: `font-normal`
- Emphasis: `font-medium`
- Headers: `font-semibold` or `font-bold`
- Data/numbers: `font-mono`

### Text Colors
- Primary: `text-nasun-white`
- Secondary: `text-nasun-white/80` or `text-slate-400`
- Muted: `text-slate-500`
- Links: `text-nasun-c4 hover:underline`

### Headers
```tsx
<h1 className="text-2xl font-bold">Page Title</h1>
<h2 className="text-xl font-semibold">Section Title</h2>
<h3 className="text-lg font-semibold">Subsection Title</h3>
```

---

## Status Colors

| Status | Color | Class |
|--------|-------|-------|
| Success | Green | `bg-green-900/50 text-green-400` |
| Error | Red | `bg-red-900/50 text-red-400` |
| Warning | Gold | `bg-nasun-c1/20 text-nasun-c1` |
| Info | Blue | `bg-nasun-c4/20 text-nasun-c4` |

---

## Best Practices

1. **Consistency**: Use the defined color palette consistently across all pages
2. **Accessibility**: Maintain sufficient color contrast for readability
3. **Hover States**: Always provide visual feedback on interactive elements
4. **Dark Theme**: Design with dark background as primary
5. **No Red for UI**: Avoid scarlet/coral colors except for actual error states
6. **English Only**: All UI text and date/time formatting must be in English

---

## File Structure

```
src/components/ui/
├── Card.tsx        # Card container component
├── SectionBox.tsx  # Section with title/divider
└── index.ts        # Public exports
```
