/** @type {import('tailwindcss').Config} */

// Kyriq premium-glass design system — see docs/DESIGN-SYSTEM.md.
// Every token in app/globals.css :root is mirrored here so the utility exists.
// Adding a variable to :root without adding it here is why the old @apply block was inert.

// hsl token -> alpha-capable Tailwind colour, so `bg-success-bg/30` generates.
const t = (name) => `hsl(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: t("border"),
        input: t("input"),
        ring: t("ring"),
        background: t("background"),
        foreground: t("foreground"),
        // shadcn surfaces, used by the ported admin console's menus and sheets.
        card: { DEFAULT: t("card"), foreground: t("card-foreground") },
        popover: { DEFAULT: t("popover"), foreground: t("popover-foreground") },

        // Brand — Indigo #6366f1 / Emerald #10b981
        brand: {
          DEFAULT: t("brand"),
          light: t("brand-light"),
          dark: t("brand-dark"),
          deep: t("brand-deep"),
          tint: t("brand-tint"),
          wash: t("brand-wash"),
        },
        accentEmerald: {
          DEFAULT: t("emerald"),
          dark: t("emerald-dark"),
          tint: t("emerald-tint"),
        },

        primary: {
          DEFAULT: t("primary"),
          foreground: t("primary-foreground"),
          light: t("primary-light"),
          dark: t("primary-dark"),
          deep: t("primary-deep"),
          bg: t("primary-bg"),
          text: t("primary-text"),
        },
        secondary: {
          DEFAULT: t("secondary"),
          foreground: t("secondary-foreground"),
        },
        destructive: {
          DEFAULT: t("destructive"),
          foreground: t("destructive-foreground"),
          dark: t("destructive-dark"),
          bg: t("error-bg"),
          text: t("error-text"),
        },
        muted: {
          DEFAULT: t("muted"),
          foreground: t("muted-foreground"),
        },
        accent: {
          DEFAULT: t("accent"),
          foreground: t("accent-foreground"),
        },

        // State families. Every `-text` value is verified >= 4.5:1 on its own `-bg`.
        success: {
          DEFAULT: t("success"),
          foreground: t("success-foreground"),
          dark: t("success-dark"),
          bg: t("success-bg"),
          text: t("success-text"),
          border: t("success-border"),
        },
        warning: {
          DEFAULT: t("warning"),
          foreground: t("warning-foreground"),
          dark: t("warning-dark"),
          bg: t("warning-bg"),
          text: t("warning-text"),
          border: t("warning-border"),
        },
        error: {
          DEFAULT: t("error"),
          foreground: t("error-foreground"),
          dark: t("error-dark"),
          bg: t("error-bg"),
          text: t("error-text"),
          border: t("error-border"),
        },
        info: {
          DEFAULT: t("info"),
          foreground: t("info-foreground"),
          dark: t("info-dark"),
          bg: t("info-bg"),
          text: t("info-text"),
          border: t("info-border"),
        },
        neutral: {
          bg: t("neutral-bg"),
          text: t("neutral-text"),
          border: t("neutral-border"),
        },

        // Ink — body text sits at full strength over glass (rule 8).
        ink: {
          DEFAULT: t("ink"),
          strong: t("ink-strong"),
          body: t("ink-body"),
          soft: t("ink-soft"),
          faint: t("ink-faint"),
          invert: t("ink-invert"),
        },

        // Surfaces / glass. Raw rgba so alpha is part of the token.
        app: {
          bg: t("app-bg"),
        },
        surface: {
          DEFAULT: t("surface"),
          tint: t("surface-tint"),
          sunken: t("surface-sunken"),
        },
        // NOTE: `panel`, `modal`, `toast` and `selected` are deliberately NOT
        // colour entries here. Each one is also a boxShadow key, and Tailwind
        // emits a rule for both — so `.shadow-glass-modal` got a shadow rule AND
        // a shadow-*colour* rule, the colour rule came last, and the layered
        // glow silently never rendered. The shadow utilities are used; these
        // colour names were used nowhere, so removing them de-ambiguates all
        // four with no call-site churn. The surfaces get their background from
        // the .glass-* classes in globals.css, which read the same variables
        // directly. check-primitives.ts fails if a collision reappears.
        glass: {
          card: "var(--glass-card-bg)",
          chrome: "var(--glass-chrome-bg)",
          border: "var(--glass-border)",
          hairline: "var(--glass-hairline)",
          "border-dark": "var(--glass-border-dark)",
          "hairline-dark": "var(--glass-hairline-dark)",
        },

        // Dark shell (sidebar) — stays dark, becomes true glass.
        shell: {
          DEFAULT: "var(--shell-bg)",
          solid: t("shell-solid"),
          text: t("shell-text"),
          muted: t("shell-text-muted"),
          active: t("shell-active-text"),
        },
        sidebar: {
          bg: t("sidebar-bg"),
          text: t("sidebar-text"),
          "active-bg": t("sidebar-active-bg"),
          "active-text": t("sidebar-active-text"),
        },
      },

      // Radius scale (DESIGN-SYSTEM 5.2). No sharp corners, nothing below 10px.
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        input: "var(--radius-input)",   // 14px
        btn: "var(--radius-btn)",       // 16px
        pill: "var(--radius-pill)",     // 20px
        card: "var(--radius-card)",     // 24px
        modal: "var(--radius-modal)",   // 26px
        tile: "var(--radius-tile)",     // 20px
        full: "9999px",
      },

      // Shadows always layer two deep and are tinted with the ground, never black.
      boxShadow: {
        hairline: "var(--shadow-hairline)",
        contact: "var(--shadow-contact)",
        glass: "var(--shadow-glass)",
        "glass-hover": "var(--shadow-glass-hover)",
        "glass-panel": "var(--shadow-glass-panel)",
        "glass-modal": "var(--shadow-glass-modal)",
        "glass-sheet": "var(--shadow-glass-sheet)",
        "glass-toast": "var(--shadow-glass-toast)",
        "glass-selected": "var(--shadow-glass-selected)",
        "brand-glow": "var(--shadow-brand-glow)",
        "danger-glow": "var(--shadow-danger-glow)",
        "inner-track": "var(--shadow-inner-track)",
        bevel: "var(--bevel)",
      },

      backdropBlur: {
        veil: "0.6px",
        card: "18px",
        bright: "28px",
        modal: "24px",
        chrome: "26px",
        toast: "30px",
      },
      backdropSaturate: {
        120: "1.2",
        150: "1.5",
        160: "1.6",
        180: "1.8",
      },

      // Motion — one house curve, four durations.
      transitionTimingFunction: {
        settle: "cubic-bezier(0.23, 1, 0.32, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        exit: "cubic-bezier(0.4, 0, 1, 1)",
      },
      transitionDuration: {
        tap: "120ms",
        quick: "200ms",
        settle: "240ms",
        reveal: "280ms",
        pop: "460ms",
      },
      scale: {
        press: "0.96",
        "press-sm": "0.95",
        pop: "0.86",
      },
      opacity: {
        disabled: "0.45",
      },

      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-heading)"],
        display: ["var(--font-heading)"],
        mono: ["var(--font-mono)"],
      },

      // Type scale — display line-heights pair per step, tracking inverts at the eyebrow.
      fontSize: {
        eyebrow: ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.16em" }],
        xs: ["0.75rem", { lineHeight: "1.5", letterSpacing: "0" }],
        sm: ["0.875rem", { lineHeight: "1.5", letterSpacing: "0" }],
        base: ["1rem", { lineHeight: "1.5", letterSpacing: "0" }],
        lg: ["1.125rem", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        xl: ["1.25rem", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        "2xl": ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        "3xl": ["1.875rem", { lineHeight: "1.15", letterSpacing: "-0.015em" }],
        "4xl": ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "5xl": ["3rem", { lineHeight: "1.05", letterSpacing: "-0.022em" }],
        "6xl": ["3.75rem", { lineHeight: "1.02", letterSpacing: "-0.025em" }],
      },
      letterSpacing: {
        wordmark: "-0.025em",
        display: "-0.015em",
        eyebrow: "0.16em",
      },

      minHeight: {
        btn: "3rem",
        tap: "2.75rem",
        input: "2.75rem",
      },

      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        // ---- Magic-UI decorative keyframes. Preserved verbatim; four components
        // ---- (marquee, border-beam, shimmer-button, number-ticker) depend on these
        // ---- and on --duration / --speed / --gap. Do not rewrite.
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - var(--gap)))" },
        },
        "marquee-vertical": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(calc(-100% - var(--gap)))" },
        },
        "border-beam": {
          "100%": { "offset-distance": "100%" },
        },
        "shimmer-slide": {
          to: { transform: "translate(calc(100vw - 100%), 0)" },
        },
        "spin-around": {
          "0%": { transform: "translateZ(0) rotate(0)" },
          "15%, 35%": { transform: "translateZ(0) rotate(90deg)" },
          "65%, 85%": { transform: "translateZ(0) rotate(270deg)" },
          "100%": { transform: "translateZ(0) rotate(360deg)" },
        },
        // ---- end preserved block ----
        "gradient-flow": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },

        // Entrances are CSS keyframes, never JS tweens (DESIGN-SYSTEM 4.4).
        "glass-rise": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        "glass-fade": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "dialog-pop": {
          from: { opacity: "0", transform: "scale(0.86)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "popover-in": {
          from: { opacity: "0", transform: "translateY(-6px) scale(0.94)" },
          to: { opacity: "1", transform: "none" },
        },
        "sheet-up": {
          from: { transform: "translateY(110%)" },
          to: { transform: "translateY(0)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(-10px) scale(0.96)" },
          to: { opacity: "1", transform: "none" },
        },
        "skeleton-sheen": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(100%)" },
        },
        "mesh-drift-a": {
          "0%, 100%": { transform: "translate3d(-6%, -4%, 0) scale(1)" },
          "50%": { transform: "translate3d(5%, 6%, 0) scale(1.12)" },
        },
        "mesh-drift-b": {
          "0%, 100%": { transform: "translate3d(6%, 5%, 0) scale(1.08)" },
          "50%": { transform: "translate3d(-5%, -6%, 0) scale(1)" },
        },
      },

      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // ---- preserved: Magic-UI animations driven by --duration / --speed ----
        marquee: "marquee var(--duration) linear infinite",
        "marquee-vertical": "marquee-vertical var(--duration) linear infinite",
        "border-beam": "border-beam calc(var(--duration)*1s) infinite linear",
        "shimmer-slide": "shimmer-slide var(--speed) ease-in-out infinite alternate",
        "spin-around": "spin-around calc(var(--speed) * 2) infinite linear",
        // ---- end preserved block ----
        "gradient-flow": "gradient-flow 6s ease infinite",
        "float": "float 6s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",

        "glass-rise": "glass-rise var(--dur-reveal) var(--ease-settle) both",
        "glass-fade": "glass-fade var(--dur-quick) var(--ease-settle) both",
        "dialog-pop": "dialog-pop 460ms var(--ease-spring) both",
        "popover-in": "popover-in 320ms var(--ease-spring) both",
        "sheet-up": "sheet-up var(--dur-reveal) var(--ease-settle) both",
        "toast-in": "toast-in var(--dur-settle) var(--ease-settle) both",
        "skeleton-sheen": "skeleton-sheen 1.6s var(--ease-settle) infinite",
        // Prime-ratio loops, 60s and 75s, so the two fields never resync.
        "mesh-drift-a": "mesh-drift-a 60s var(--ease-settle) infinite",
        "mesh-drift-b": "mesh-drift-b 75s var(--ease-settle) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
