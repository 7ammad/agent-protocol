# Design Tokens — Agent Protocol Dashboard

Built on the **Liquid Glass Design System** (`C:\Dev\Builds\lab\design-vault\liquid-glass\`).
Dark mode, glass surfaces, proper motion. Not template CSS.

---

## Foundation: Liquid Glass Integration

The dashboard uses the liquid glass dark theme as its base. Import these CSS files in order:

```html
<!-- Liquid Glass Foundation (copy from vault or link) -->
<link rel="stylesheet" href="tokens/colors.css">      <!-- 12-step color scales -->
<link rel="stylesheet" href="tokens/typography.css">   <!-- Inter + JetBrains Mono -->
<link rel="stylesheet" href="tokens/spacing.css">      <!-- 4px base spacing -->
<link rel="stylesheet" href="tokens/elevation.css">    <!-- Shadows, blur, radius, z-index -->
<link rel="stylesheet" href="tokens/motion.css">       <!-- Durations, easing, springs -->
<link rel="stylesheet" href="core/materials.css">      <!-- Glass surface classes -->
<link rel="stylesheet" href="core/dark-mode.css">      <!-- Dark theme overrides -->

<!-- Dashboard-specific overrides -->
<link rel="stylesheet" href="styles.css">              <!-- Agent Protocol layer -->
```

The dashboard root element gets `class="lg-dark"` to activate dark mode. All `--lg-*` tokens auto-adapt.

**Vault source:** `C:\Dev\Builds\lab\design-vault\liquid-glass\`

---

## Dashboard Color Layer

These are **agent-protocol-specific** semantic tokens layered on top of liquid glass. Define them in `styles.css`:

### Page Background

The original plan specifies navy `#0a0e27`. This replaces the default `--lg-gray-1` (`#111113`) in dark mode:

```css
.lg-dark {
  --ap-bg-deep: #0a0e27;         /* Deep navy — page background */
  --ap-bg-card: #1a1f3a;         /* Card backgrounds (replaces lg-glass-bg) */
  --ap-bg-card-hover: #222850;   /* Card hover state */
  --ap-bg-surface: #0d1230;      /* Header, sidebar */
}
```

### Gold Accent (Agent Protocol Brand)

```css
.lg-dark {
  --ap-gold: #d4af37;
  --ap-gold-dim: #a68929;
  --ap-gold-glow: rgba(212, 175, 55, 0.15);
  --ap-gold-tint: rgba(212, 175, 55, 0.08);
}
```

### Agent Status Colors

Map to liquid glass semantic scale where possible:

| Status | Token | Value | LG Reference |
|--------|-------|-------|-------------|
| idle | `--ap-status-idle` | `var(--lg-primary-9)` | `#5b9cf0` (dark mode blue) |
| working | `--ap-status-working` | `var(--lg-success-9)` | `#34d399` (dark mode green) |
| blocked | `--ap-status-blocked` | `var(--lg-danger-9)` | `#f87171` (dark mode red) |
| waiting_review | `--ap-status-review` | `var(--lg-warning-9)` | `#fbbf24` (dark mode amber) |
| offline | `--ap-status-offline` | `var(--lg-gray-8)` | `#5a6169` (dark mode gray) |

### Event Action Colors

| Event prefix | Token | Value |
|-------------|-------|-------|
| `agent.*` | `--ap-event-agent` | `var(--lg-primary-9)` |
| `resource.*` | `--ap-event-resource` | `var(--ap-gold)` |
| `task.*` | `--ap-event-task` | `var(--lg-success-9)` |
| `handoff.*` | `--ap-event-handoff` | `var(--lg-accent-9)` |
| `authority.*` | `--ap-event-authority` | `var(--lg-danger-9)` |

### Tool Badge Colors

| Tool | Background | Text |
|------|-----------|------|
| `claude-code` | `rgba(93, 156, 240, 0.12)` | `var(--lg-primary-11)` |
| `cursor` | `rgba(157, 136, 229, 0.12)` | `var(--lg-accent-11)` |
| `codex` | `rgba(52, 211, 153, 0.12)` | `var(--lg-success-11)` |
| `copilot` | `rgba(251, 191, 36, 0.12)` | `var(--lg-warning-11)` |
| Other | `var(--lg-glass-bg)` | `var(--lg-gray-11)` |

These use `--lg-glass-tint-*` opacity pattern — consistent with how liquid glass does tinted surfaces.

### Role Badge Colors

| Role | Style |
|------|-------|
| `lead` | Gold glass: `background: var(--ap-gold-tint)`, `color: var(--ap-gold)`, `border: 1px solid var(--ap-gold-dim)` |
| `specialist` | Primary tint: `background: var(--lg-glass-tint-primary)`, `color: var(--lg-primary-11)` |
| `worker` | Neutral glass: `background: var(--lg-glass-bg)`, `color: var(--lg-gray-11)` |

---

## Typography

Use the liquid glass typography tokens — **Inter** for UI, **JetBrains Mono** for code/IDs:

```css
/* Already loaded via liquid-glass/tokens/typography.css */
--lg-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--lg-font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
```

### Usage Map

| Element | Class / Tokens |
|---------|---------------|
| Page title | `.lg-h4` — `var(--lg-text-2xl)`, `var(--lg-weight-semibold)` |
| Section headers | `.lg-h5` — `var(--lg-text-xl)`, `var(--lg-weight-semibold)` |
| Card titles (agent ID) | `.lg-h6` — `var(--lg-text-lg)`, `var(--lg-weight-semibold)` |
| Body text | `.lg-body` — `var(--lg-text-base)`, leading-normal |
| Secondary text | `.lg-body-sm` — `var(--lg-text-sm)`, `color: var(--lg-text-secondary)` |
| Timestamps | `.lg-caption` — `var(--lg-text-xs)`, `color: var(--lg-text-muted)` |
| Badge labels | `.lg-label` — `var(--lg-text-xs)`, `var(--lg-weight-semibold)`, tracking-wide |
| Agent IDs in timeline | `font-family: var(--lg-font-mono)` |
| File paths | `font-family: var(--lg-font-mono)`, `.lg-code-sm` |

---

## Glass Surfaces

Dashboard cards and panels use liquid glass materials — NOT flat solid backgrounds.

| Element | Glass Class | Notes |
|---------|------------|-------|
| Agent cards | `.lg-glass-interactive` | Hover lifts + glow (built-in) |
| File tree panel | `.lg-glass-regular` | Standard glass card |
| Event timeline | `.lg-glass-thin` | Subtle, doesn't compete with content |
| Task board columns | `.lg-glass-thin` | Each column is a thin glass panel |
| Task cards | `.lg-glass-interactive` | Clickable feel |
| Header bar | `.lg-glass-thick` | Prominent, frosted top bar |
| Conflict alert banner | `.lg-glass-primary` tinted with danger | `border-color: var(--lg-danger-9)` override |
| Lead agent card | `.lg-glass-interactive` + gold border | `border-color: var(--ap-gold)`, `box-shadow: 0 0 20px var(--ap-gold-glow)` |

### Dark Mode Glass Values (from `dark-mode.css`)

```css
--lg-glass-bg: rgba(255, 255, 255, 0.06);
--lg-glass-bg-hover: rgba(255, 255, 255, 0.1);
--lg-glass-bg-active: rgba(255, 255, 255, 0.14);
--lg-glass-border: rgba(255, 255, 255, 0.12);
--lg-glass-border-subtle: rgba(255, 255, 255, 0.06);
--lg-glass-highlight: rgba(255, 255, 255, 0.15);
```

### Specular Highlight

Add `.lg-specular` to the header bar for the inner shine line effect — the 1px highlight at the top edge that gives the glass its depth.

---

## Elevation & Shadows

Use liquid glass shadow tokens — **NOT** flat `box-shadow` values:

| Element | Shadow Token |
|---------|-------------|
| Cards (resting) | `var(--lg-shadow-glass)` |
| Cards (hover) | `var(--lg-shadow-glass-hover)` |
| Header bar | `var(--lg-shadow-glass-lg)` |
| Badges | `var(--lg-shadow-xs)` |
| Gold glow on lead | `0 0 20px var(--ap-gold-glow)` |
| Status dot glow | `0 0 8px currentColor` (uses status color) |

### Backdrop Blur

| Element | Blur Token |
|---------|-----------|
| Header | `var(--lg-blur-xl)` — 24px |
| Cards | `var(--lg-blur-lg)` — 16px |
| Thin panels | `var(--lg-blur-sm)` — 4px |

### Border Radius

| Element | Radius Token |
|---------|-------------|
| Cards | `var(--lg-radius-xl)` — 16px |
| Badges/pills | `var(--lg-radius-full)` — pill shape |
| Status dots | `var(--lg-radius-full)` — circle |
| Sections | `var(--lg-radius-2xl)` — 20px |
| Inputs | `var(--lg-radius-md)` — 8px |

### Z-Index

| Element | Z-Index Token |
|---------|--------------|
| Header | `var(--lg-z-sticky)` — 1100 |
| Tooltips | `var(--lg-z-tooltip)` — 1600 |
| Conflict banner | `var(--lg-z-banner)` — 1200 |

---

## Motion & Animation

Use liquid glass motion tokens — NOT hardcoded `250ms ease`:

### Transitions

| Interaction | Transition Token |
|------------|-----------------|
| Card hover | `var(--lg-transition-moderate)` — 300ms spring |
| Badge appear | `var(--lg-transition-fast)` — 100ms ease-out |
| Color changes | `var(--lg-transition-colors)` — 200ms per-property |
| Status dot pulse | Custom keyframe (see below) |
| New event slide-in | Custom keyframe (see below) |

### Easing Curves

| Motion | Easing Token |
|--------|-------------|
| Hover lift | `var(--lg-ease-spring)` — `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Fade in | `var(--lg-ease-out)` — `cubic-bezier(0, 0, 0.2, 1)` |
| Slide in | `var(--lg-ease-snappy)` — `cubic-bezier(0.16, 1, 0.3, 1)` |
| Bounce (conflict alert) | `var(--lg-ease-bounce)` — `cubic-bezier(0.68, -0.55, 0.265, 1.55)` |

### Custom Keyframes (dashboard-specific)

```css
/* Working status — pulsing dot */
@keyframes ap-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.6; }
}
.ap-status-dot--working {
  animation: ap-pulse 2s var(--lg-ease-in-out) infinite;
}

/* New event enters timeline */
@keyframes ap-slide-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.ap-event-enter {
  animation: ap-slide-in var(--lg-duration-moderate) var(--lg-ease-snappy);
}

/* Stagger for initial load (agent cards, task cards) */
.ap-stagger-1 { animation-delay: var(--lg-stagger-1); }
.ap-stagger-2 { animation-delay: var(--lg-stagger-2); }
.ap-stagger-3 { animation-delay: var(--lg-stagger-3); }
.ap-stagger-4 { animation-delay: var(--lg-stagger-4); }

/* Conflict alert shake */
@keyframes ap-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
.ap-conflict-alert {
  animation: ap-shake var(--lg-duration-slow) var(--lg-ease-bounce);
}
```

### Reduced Motion

Liquid glass handles this globally via `motion.css` — all `--lg-duration-*` tokens collapse to `0ms` under `prefers-reduced-motion: reduce`. The custom keyframes above also respect this:

```css
@media (prefers-reduced-motion: reduce) {
  .ap-status-dot--working,
  .ap-event-enter,
  .ap-conflict-alert {
    animation: none;
  }
}
```

---

## File Resource State Styling

| State | Left Border | Background | Text |
|-------|------------|-----------|------|
| `free` | none | transparent | `var(--lg-text-muted)` |
| `claimed` | `3px solid var(--ap-gold)` | `var(--ap-gold-tint)` | `var(--lg-text)` |
| `conflicted` | `3px solid var(--lg-danger-9)` | `rgba(248, 113, 113, 0.08)` | `var(--lg-danger-11)` |

---

## Responsive

| Breakpoint | Layout |
|-----------|--------|
| `>= 900px` | 2-column CSS Grid (agent cards + file tree side by side) |
| `< 900px` | Single column, all sections stacked vertically |
| `< 768px` | Typography scales down (liquid glass handles via responsive type in `typography.css`) |

---

## Status Dots

- Size: **8px** circle (`width: 8px; height: 8px; border-radius: var(--lg-radius-full)`)
- Color: matches `--ap-status-*` token
- Working: `.ap-status-dot--working` pulsing animation
- Glow: `box-shadow: 0 0 8px currentColor` for active statuses
- Positioned inline-flex before agent ID

---

## Summary: What NOT to Do

- Do NOT use flat `background-color` on cards — use glass surfaces with `backdrop-filter`
- Do NOT hardcode `transition: 0.3s ease` — use `var(--lg-transition-*)` tokens
- Do NOT use `box-shadow: 0 2px 8px rgba(0,0,0,0.3)` — use `var(--lg-shadow-glass)`
- Do NOT use `border-radius: 8px` — use `var(--lg-radius-*)` tokens
- Do NOT use `system-ui` as font — use `var(--lg-font-sans)` (Inter)
- Do NOT create new color values — use the `--lg-*` scale or `--ap-*` semantic tokens
