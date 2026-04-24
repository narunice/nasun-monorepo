# GoStop Design System

> Single source of truth for visual language across all gostop.app games.
> Read this before adding a new game, page, or component.

---

## Brand Position

**GoStop is a luxury onchain casino prototype.**

- Not "crypto bro neon" (Stake, Rollbit aesthetic). Not "playful pastel" (modern fintech).
- Reference points: Bellagio high-roller pit at 2am, Singapore Marina Bay Sands sky bar, classic Cartier ad campaigns.
- Tone: confident, restrained, precious. Texture over decoration. Black + gold + emerald + ink.
- The product is a **prototype**, but the surface should never feel prototype-y. Polish ratio: 95% surface, 5% scope.

### Three words

**Restrained. Precious. Inevitable.**

If a screen feels busy, decorative, or "fun" in a kids-arcade way, it is wrong. If it feels like the chip rack in a Monaco salon, it is right.

---

## Foundations

### Color tokens (`tailwind.config.cjs`)

```
ink-950   #07070a   page background base
ink-900   #0b0b10   panel background base
ink-800   #141420   raised panel
ink-700   #1c1c2b   elevated card / hover
ink-600   #2a2a3a   borders on dark, scrollbar thumb
ink-500   #3a3a4c   subtle separator on dark

gold-50   #fdf6e3   gold tint, body text on dark gold
gold-100  #f8e8b6   pale gold, hover text
gold-200  #f2d67b   primary gold text on dark
gold-300  #e8c158   secondary gold text, ghost button text
gold-400  #d4af37   SIGNATURE GOLD (logos, primary CTAs)
gold-500  #b68d22   pressed state, deep gold
gold-600  #8a6a18   gradient stop dark end
gold-700  #5d4710   border on light, deep accent

emerald-500..950    accent for "claim", "success", "winner"
crimson-500..700    used sparingly for destructive / loss / urgency
```

**Rules**:
- Primary surface is always `ink-950` body + `panel` component (gradient ink-800/ink-900 with subtle gold border).
- Gold is for value, status, and brand. Never for body text.
- Emerald is for positive monetary events (winnings, claim, deposits). Never for game branding.
- Crimson only for: claim deadline urgency (24h left), forfeit, error state. Never as primary CTA.

### Typography

| Family | Use | Tailwind |
|---|---|---|
| **Playfair Display** (serif) | Headings, game names, large numbers like jackpot pool | `font-display` |
| **Inter** (sans) | Body, UI, labels | `font-sans` (default) |
| **JetBrains Mono** | Numeric values, ticket numbers, addresses, countdowns | `font-mono` |

**Type scale (current usage)**:
- Hero (h1): `text-4xl md:text-5xl font-display text-gold`
- Section (h2): `text-2xl font-display text-gold`
- Subsection (h3): `text-lg font-display`
- Body: `text-base text-neutral-200` (NEVER below `text-sm` per `feedback_ui_readability` memory)
- Labels: `text-sm uppercase tracking-[0.25em] text-neutral-200`
- Numeric / mono: `text-base font-mono tabular-nums text-gold-200`

**Don't**: `text-xs`, `text-neutral-400` and below, opacity below 70%.

### Spacing & layout

- Page wrapper: `max-w-6xl mx-auto px-5 py-10`
- Vertical rhythm between sections: `space-y-8`
- Panel internal padding: `p-7` standard, `p-8` for hero
- Border radius: `rounded-lg` (cards), `rounded-full` (buttons + chips)
- Grid: prefer `grid md:grid-cols-[1.3fr_1fr]` for "main + side" layouts; uniform `grid-cols-N` for symmetric content

### Elevation

Three levels only:
1. **Page** (no shadow, ink-950)
2. **Panel** (`.panel` class: gradient ink-800/900, 1px gold-12% border, subtle inner shadow)
3. **Hover/active** (slight `translate-y-[-1px]` + intensified gold glow)

Never use modal-style heavy drop shadows. Glow > shadow.

### Texture & background

`body` carries two faint radial gradients (gold top-left 5%, emerald bottom-right 4%) over a dark vertical gradient. This is the only ambient texture. **Don't add per-page background patterns**; let the components be the texture.

---

## Components

### Existing (lottery)

| Class | Use |
|---|---|
| `.panel` | Base card surface |
| `.btn-gold` | Primary CTA (Buy, Claim) |
| `.btn-ghost` | Secondary action (Quick Pick, Clear, Dismiss) |
| `.text-gold` | Gold gradient text fill (for h1 / brand) |
| `.border-gold-subtle` | 12-20% gold border for subtle separation |
| `.number-ball` | 1-25 number selector (round chip) |
| `.number-ball.is-selected` | Picked state (filled gold gradient) |

### Reusable patterns

- **Round chip / token**: `.number-ball` extends to any "small token of value" — chip color, lucky number, multiplier
- **Status pill**: `text-sm uppercase tracking-[0.3em] text-gold-300` over `text-gold-100` for state labels
- **Deadline urgency**: amber tone (`border-amber-500/60 bg-amber-950/40`) when < 24h, swap to crimson if < 1h

### Gaps to fill before Phase 2

| Component | Status | Why needed |
|---|---|---|
| Toast / inline notification | missing | Tx submitted / confirmed feedback |
| Modal / dialog | missing | Confirmation, large reveals (jackpot animation) |
| Skeleton loader | missing | Round/ticket data fetching states |
| Multiplier display (large, animated) | missing | Crash, Wheel, Plinko core |
| Bet input with quick chips ($5, $10, $50) | missing | Every game beyond lottery |
| Auto-bet panel | missing | Crash standard feature |
| Live history feed (last 30 results) | missing | Crash, Roulette trust signal |
| Provably fair seed display | missing | Crash + future games (commit-reveal) |
| Hot/cold number tracker | missing | Roulette, Plinko |

---

## Game-specific design language

### Lottery (current, 5-of-25)

- **Vibe**: weekly ritual, slow burn, prestige
- Hero element: large countdown to next draw + accumulated prize pool
- Number selection: 25 chips in a 5x5 grid, gold when selected
- Ticket card: 5 picked numbers + round number + status (pending / won / claim deadline)
- Outcome reveal: post-draw, hits highlighted in gold, misses dimmed

### Crash (Phase 2 signature)

- **Vibe**: instantaneous, breathless, communal
- Hero element: rocket curve climbing exponential multiplier (canvas/svg)
- Bet panel: amount + auto-cashout multiplier, side-by-side with chart
- Live participants list: scrolling sidebar of active bets and cashed-out players
- Crash moment: chart freezes red, multiplier glows crimson, all uncashed bets fade
- Provably-fair: bottom-bar "Round #1234 hash: 0x..." with reveal-on-click

### Plinko (Phase 2)

- **Vibe**: physical, satisfying, low-stakes joy
- Hero element: triangular peg field, ball drops with physics
- Risk slider: low/medium/high (changes peg layout + payout multipliers)
- Multiplier row at bottom: 17-19 buckets, color gradient (cool=loss to gold=jackpot)
- Sound: each peg hit = subtle chime; final bucket landing = either gold ring or crimson flash

### Mines (Phase 2)

- **Vibe**: tense, deliberate, single-player
- Hero element: 5x5 grid, click to reveal gem (gold) or mine (crimson explosion)
- Bet panel: amount + mine count selector (1-24)
- Cashout button: prominent gold, multiplier increases per safe reveal
- Reveal animation: tile flip with 3D depth, gold rotation if gem

### Roulette (Phase 2)

- **Vibe**: classic, formal, social table
- Hero element: traditional European wheel (single-zero, casino orange/black/green)
- Bet table: standard layout, chip stacking on tap
- Spin animation: 6-8s real wheel rotation, ball drop, deceleration
- Recent results: last 18 numbers as horizontal pill row above bet table

### Wheel (Phase 2, last)

- **Vibe**: party, instant, low-investment
- Hero element: large segmented wheel (16-50 segments, varying colors by multiplier)
- Bet input + spin button → wheel decelerates → marker lands
- Stake-style "low/medium/high" risk presets
- Optional: confetti burst on > 10x

---

## Motion principles

- **Easing**: `ease-out` for arrivals, `ease-in` for departures. Default duration 200ms (UI), 400ms (reveal), 800-3000ms (game outcome).
- **Always animate**: hover lift, button press, modal open/close, number flip
- **Never animate**: scroll, page transitions (instant feels luxe; transitions feel marketing-y)
- **Reduced motion**: respect `prefers-reduced-motion`, snap all 400ms+ animations to instant

---

## Sound (Phase 2 onward)

- Mute by default. Toggle in header.
- Asset budget: ≤ 8 short SFX (button tap, chip stack, win small, win jackpot, lose, draw start, countdown tick, error)
- No music. Casino is loud enough.
- Source: pure synthesis (Tone.js) preferred over WAV files for bundle size.

---

## Localization

**English only** in Phase 1 launch.

Add a thin `t(key)` shim in Phase 2 (avoid `react-i18next`'s 50KB until needed). Korean (KR) is the next locale, given user base. Number formatting always `en-US` per CLAUDE.md.

---

## Accessibility checklist

- [ ] All interactive elements have `aria-label` if icon-only
- [ ] Keyboard navigation: tab order matches visual order
- [ ] Focus rings: gold 2px outline, never `outline: none` without replacement
- [ ] Color contrast: all body text passes WCAG AA on ink-950 background (current `text-neutral-200` = 14.5:1, OK)
- [ ] Number balls: have `aria-pressed` on selection state (already implemented)
- [ ] Animations: respect `prefers-reduced-motion`

---

## Design system roadmap

- **Phase 1 (now)**: lottery only. Existing components frozen. No new tokens.
- **Phase 1.5 (post-launch polish, ~1 week)**: extract `Button`, `Panel`, `Badge`, `Toast`, `Modal` into `src/components/ui/`. Today these are inlined per-page; refactor before Crash work.
- **Phase 2 (Crash signature)**: add `Multiplier`, `BetInput`, `LiveFeed`, `ProvablyFairBar`. Keep them in `src/components/game/` (game-shared, not game-specific).
- **Phase 3 (Plinko + Mines + Roulette + Wheel)**: each game gets `src/features/<game>/components/` for game-specific UI; reuse shared `game/` components.

---

## What to copy when adding a new game

1. Open this file. Confirm vibe + hero element + interaction primitives match a planned game.
2. Reuse panel, btn-gold, btn-ghost, text-gold, font-display, color tokens. **Do not introduce new colors or fonts** without updating this doc first.
3. Game-specific motif (crash rocket, plinko field, etc.) goes into the page, not into the design tokens.
4. If a new shared primitive is needed, build it in `src/components/game/` and document here under "Components".

---

## Anti-patterns (do not do)

- Neon glow animations on body text
- Stake.com-style cyan/purple gradients
- Bouncing/wobbling micro-interactions on every button
- Lots of icons (one icon per cluster max; gold serif numerals carry the brand)
- Drop shadows for depth (glow only)
- More than 3 colors in a single screen besides ink + gold + one accent
- Marketing-y page transitions (slide-in pages, ken burns hero images)
- Per-page background images
- Modal stacks (one modal at a time, never nested)
- Em dashes (`—`) anywhere in copy (use `,` `.` `(...)` or `-` per `MEMORY.md` user preference)

---

## Versioning

This file is the design contract. Changes require commit + reference in PR description. Future games inherit from this; if a game needs to break the contract, this doc gets a versioned section explaining why (precedent: documented exception, never silent drift).

Last updated: 2026-04-24 (post v4 deploy)
