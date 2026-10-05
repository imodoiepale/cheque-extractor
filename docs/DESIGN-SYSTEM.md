# Kyriq design system: premium glass

The surface language for the whole app, ported from depthme.app and adapted for a light substrate.

Every parcel agent reads this before writing a line. The values here are measured from a shipped app,
not invented. Do not re-derive them, and do not add a second way of doing any of these things.

**Target:** Tailwind v3.4.1 with `tailwind.config.js`. Already available: `framer-motion`,
`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`. No new dependencies.

---

## 1. The decision: light glass, dark shell

DepthMe is dark because it is a meditation app sitting on full-bleed artwork. Kyriq is a financial
tool that accountants read for eight hours a day, and the signed-off prototype and website are both
light. So we take DepthMe's *techniques* and apply them to a light substrate.

| | DepthMe (dark) | Kyriq (light) |
|---|---|---|
| Page ground | `#050814` | soft indigo-tinted gradient mesh |
| Card background | `rgba(11,16,32,0.74)` | `rgba(255,255,255,0.72)` |
| Border | `1px solid rgba(255,255,255,0.08)` | `1px solid rgba(255,255,255,0.7)` |
| Top inner highlight | `inset 0 1px 0 rgba(255,255,255,0.06–0.14)` | `inset 0 1px 0 rgba(255,255,255,0.9)` |
| Shadow | `0 10px 30px rgba(0,0,0,0.35)` | `0 10px 30px rgba(15,23,42,0.08)` |
| Hairline | `rgba(255,255,255,0.06)` | `rgba(15,23,42,0.07)` |
| Sidebar | — | stays dark, becomes true glass |

Brand accents are Indigo `#6366f1` and Emerald `#10b981` from the logo pack. Glass stays neutral;
colour marks state and action only.

Dark mode stays possible later. A full `.dark` block already exists in `globals.css` and is currently
dead because nothing toggles it. Do not build it now, but do not write tokens that make it impossible.

---

## 2. Glass

### 2.1 The card recipe

Four cues working together. Drop any one and it reads generic.

```css
.glass {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),   /* lit top bevel */
    0 1px 2px rgba(15, 23, 42, 0.04),          /* contact */
    0 10px 30px rgba(15, 23, 42, 0.08);        /* ambient */
  backdrop-filter: blur(18px) saturate(120%);
  -webkit-backdrop-filter: blur(18px) saturate(120%);
}
```

The `saturate()` is the most commonly omitted part and the most important. Without it the frost goes
grey and the whole thing looks like a disabled state.

### 2.2 Blur scales with elevation

The eye reads "further from the page" without needing a bigger shadow. One blur value everywhere is
what generic glass looks like.

| Surface | blur | saturate | background alpha |
|---|---|---|---|
| Page veil over the mesh | 0.6px | 120% | gradient |
| Cards, list groups | **18px** | **120%** | 0.72 |
| Modals, popovers | 24px | 150% | 0.92 |
| Sidebar, sticky headers | 26px | 160% | 0.70 |
| Toasts | 30px | 180% | 0.80 |

**Never nest two blurred surfaces directly.** A blurred card inside a blurred panel double-composites
and both go muddy.

### 2.3 Shadows

- **Never pure black.** Tint them with the ground: `rgba(15,23,42,…)` on light, navy on dark.
- **Blur radius ≈ 2.2× the y-offset.** `0 10px 30px`, `0 20px 44px`, `0 24px 60px`, `0 30px 80px`.
- **Layer two deep** at rest: a tight contact shadow plus a wide ambient one.
- **Bottom sheets invert y to negative** (`0 -8px 48px`) because light comes from above.
- Accent glows are a coloured drop shadow (`0 22px 56px <accent>`), not a centred halo, so selection
  reads as physical lift.

### 2.4 Selected states get denser, never lighter

Raise the background opacity and add a three-stop shadow:

```css
.glass--selected {
  background: rgba(255, 255, 255, 0.86);          /* denser, not lighter */
  border-color: rgba(99, 102, 241, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 0 0 1px rgba(99, 102, 241, 0.55),           /* hairline ring */
    0 22px 56px rgba(99, 102, 241, 0.16);         /* coloured lift */
}
```

**Border width is inherited, never changed.** Both of these are documented regressions in the source
app: a lighter selected surface washed out the description text, and a thicker border reflowed the
content inside the card. Selecting a row must never move text.

### 2.5 Three-tier degradation, because blur is never guaranteed

The source app's comment is blunt: the blur "computed to `none` in the render used to check this, and
WKWebView support for it is inconsistent". Every glass surface needs two fallbacks.

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: rgba(255, 255, 255, 0.94); }
}

@media (prefers-reduced-transparency: reduce) {
  .glass {
    background: rgba(255, 255, 255, 0.97);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
```

Pattern: translucent 0.72 → `@supports` 0.94 → reduced-transparency 0.97. A glass card that silently
loses its blur must still look deliberate.

### 2.6 The ambient background

Glass over a flat page looks like a rendering bug. It needs something to refract.

- Two soft blurred colour fields drifting on **prime-ratio loops** (60s and 75s) so they never resync.
- **Animate `transform` only.** These carry a heavy blur, and compositing that per frame drops
  frames. Blur stays fixed.
- A grain overlay made of two tiled radial gradients at mismatched sizes (5px and 7px) so the pattern
  never visibly repeats, at `opacity: 0.08; mix-blend-mode: soft-light`. Zero network cost, no image.
- Per-section identity via a single `data-tone` attribute retuning four CSS variables on the *same*
  elements. No extra DOM per section.

---

## 3. Type

### 3.1 The tracking inversion

This is more of the "Apple" signal than any font choice.

| Context | letter-spacing |
|---|---|
| Wordmark | **-0.025em** |
| Display, page titles | **-0.015em** |
| Section titles | -0.015em |
| Body | 0 |
| Small-caps eyebrow | **+0.16em** |

Negative tracking tightens as size increases, then inverts hard for the one tiny uppercase style.

### 3.2 Display line-heights pair per step

A uniform 1.5 on headings is the single biggest reason a UI reads oversized.

```
lg 1.35 · xl 1.25 · 2xl 1.2 · 3xl 1.15 · 4xl 1.1 · 5xl 1.05
```

### 3.3 One heading face, behind one token

Set `--font-heading` and `--font-heading-weight` once at the root. The source app's note is worth
heeding: a font imported inside one screen and used nowhere else is exactly why that screen read as
designed and the rest did not.

A face is a family **and** a weight, and they travel together. A 400-weight serif and a 600-weight
geometric sans are what each needs to read as a heading.

Load with `next/font/google`, enumerating weights explicitly. Keep the list short; every family is
bundle weight on every cold load.

### 3.4 Tabular numerals

`font-variant-numeric: tabular-nums` on every monetary and numeric column. Non-negotiable in a
reconciliation product where columns of figures must line up.

### 3.5 Do not copy the `:not([class*="text-"])` guard

The source app documents it as a shipped bug. `[class*="text-"]` also matches `text-white`,
`text-center` and `text-balance`, so **every heading that set a colour silently lost its size** and
fell back to body size. Twenty sites across thirteen files. Rely on layer order instead.

---

## 4. Motion

### 4.1 Tokens

```css
--ease-settle: cubic-bezier(0.23, 1, 0.32, 1);   /* the house curve */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* popups only, overshoots */
--ease-exit:   cubic-bezier(0.4, 0, 1, 1);

--dur-tap:    120ms;
--dur-quick:  200ms;
--dur-settle: 240ms;
--dur-reveal: 280ms;
```

One shared curve is what makes motion read as designed rather than decorated.

### 4.2 In and out are always asymmetric

Modals arrive like objects and dismiss instantly.

| | open | close |
|---|---|---|
| Overlay | 220ms ease-out | 160ms ease-in |
| Centred dialog | **460ms spring from `scale(0.86)`** | 180ms `ease-exit` to `scale(0.94)` |
| Popover | 320ms spring, `translateY(-6px) scale(0.94)` | 140ms fade |

Scale from **0.86**, not 0.95. A big, confident pop.

### 4.3 Press

`transform: scale(0.96)` at **120ms**, faster than everything else. Disabled is `opacity: 0.45`.

**Always enumerate `transition-property`. Never `all`.** Transitioning `all` on a glass surface
animates the backdrop filter and tanks frame rate.

### 4.4 Entrances are CSS keyframes, not framer-motion

This matters and is easy to get wrong. `requestAnimationFrame` is frozen in a hidden document, so a
JS tween starting from `initial={{ opacity: 0 }}` can leave content **permanently invisible** if the
tab was backgrounded when it mounted. CSS animations run on the document timeline and do not have
this failure mode.

Use framer-motion for gestures and layout transitions. Use CSS for every entrance.

Stagger intervals: 45ms for rows, 65ms for list items, 110ms for sections. Cap the stagger at the
fifth child so a long list does not make the reader wait.

### 4.5 Reduced motion degrades, it does not delete

Ambient loops stop. Entrances **retarget to a 160ms fade** rather than vanishing. An instant pop is
more disorienting than a gentle one, which is not what the setting is asking for.

---

## 5. Components

### 5.1 Buttons

Pills. `border-radius: 9999px`, `min-height: 3rem`, inline-flex centred, `gap: 0.5rem`.

- **Primary:** a 90-degree gradient in the brand indigo, with a coloured shadow
  `0 8px 26px rgba(99,102,241,0.32)`.
- **Ghost:** hairline pill, `1px solid` at ~14% over a faint tint, with its own light blur.
- **Icon:** 42px circle, same hairline, `scale(0.95)` on press.

Loading and success are **icon swaps in a fixed-width slot**, so the button never reflows.

### 5.2 Radius scale

```
inputs 14px · buttons 16px · pills 20px · cards 20–24px · modals 26px · interactive-small full
```

This replaces the current 325-vs-119 `rounded-lg`/`rounded-xl` coin toss. Nothing uses a 2px or 4px
radius. There are no sharp corners.

### 5.3 Borders

**All borders are 1px.** The only exception is a knockout ring on a badge, which is not a border.
On light glass the border is a *light* hairline (`rgba(255,255,255,0.7)`), which is what sells the
bevel. Dividers inside a group drop to `rgba(15,23,42,0.07)`.

### 5.4 Lists

Inset-grouped. One rounded glass container, hairline dividers between rows.

**The divider starts at the text column, not the card edge.** Full-bleed rules are the Material
pattern; aligning the hairline past the icon is what makes it read as the right platform. Use an
inset `::after`, not a border.

Section captions are uppercase, tracked `+0.16em`, small, and inset to the group's rounded edge.
Not sentence-case at body size.

### 5.5 Tables

The table is the product. It must stay fast and legible.

- Glass goes on the **container and sticky header**, never on individual rows.
- Row height does not change. The premium look costs no rows on screen.
- One scrollbar per page; the table scrolls inside its own container.
- Amounts are tabular-nums and right-aligned.
- Collapse the five competing `<th>` recipes into one.

### 5.6 Navigation

Active state is **light, not fill**: a soft radial halo behind the glyph, a drop-shadow on the icon,
and a weight bump from 500 to 600. No filled capsule, no dot, no underline. The source app tried the
capsule and the dot and found both read as clutter.

### 5.7 Segmented controls

One recessed bordered track with an `inset` shadow, and a thumb moved by `transform`.

**No per-item borders.** Adding borders back to the items is what makes a segmented control look like
the wrong platform. A transform-driven thumb is cheaper than swapping backgrounds and is the only
reason the movement can be animated at all.

### 5.8 Destructive confirmation

Slide up from the bottom with Cancel as a **separate group** below the actions. Never a centred
dialog. That separation is what makes the two read as "commit" and "back out" without reading the
words.

Translate from `110%`, not `100%`, so the shadow clears too.

---

## 6. Platform correctness

Small things, each of which reads as wrong when missed.

- **Gate hover behind `@media (hover: hover) and (pointer: fine)`** so touch devices never show a
  stuck hover state.
- **Tap targets 44px minimum.** Check the computed value rather than trusting a utility class.
- **Inputs 16px on mobile** or iOS zooms the viewport on focus.
- `overscroll-behavior-y: contain` on scroll regions, or rubber-band scrolling chains to the frame
  and the whole app appears to peel away.
- Chevrons shift `2px` on press.
- `text-underline-offset: 2px` on prose links.

---

## 7. Accessibility

Glass reduces contrast, so this is not optional.

- Body text sits at **full strength** over glass. Never muted on a translucent surface.
- Every state colour verified to **4.5:1** against its actual backdrop, not against white.
- `prefers-contrast: more` raises border and text opacity.
- Focus rings are 3px at 50% opacity, visible against glass.
- Selected state is never colour alone.

---

## 8. Performance budget

- `backdrop-filter` is expensive. The comparison grid renders hundreds of rows. **Blur the chrome,
  not the rows.** Test on the 428-check batch and watch frame rate.
- Animate `transform` and `opacity` only. Never animate `filter`, `backdrop-filter`, or layout
  properties.
- Cap simultaneously blurred elements per screen. Each one is a compositing layer.
- Drop the blur where it cannot be seen. A card at 0.72 opacity over a photograph gains nothing from
  blur and costs a layer.

---

## 9. What not to port from DepthMe

- The phone frame and mockup chrome. Kyriq is a desktop-first SaaS.
- The 15px root font size. Keep 16px, which also removes the need to override `text-xs` and
  `text-sm` and lets tap-target utilities be honest.
- Capacitor and WKWebView specific viewport branches.
- The vestigial `.dark` block inherited from a component library. Decide Kyriq's theming
  deliberately.
- The unlayered-CSS-beats-utilities trick. In Tailwind, define real utilities so `bg-white/5`
  composes predictably.
