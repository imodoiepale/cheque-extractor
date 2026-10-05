'use client';

/**
 * The chart palette — the ONE place Recharts colours are declared.
 *
 * Why this file exists (CHECKLIST 2.5): Recharts takes its colours as JS
 * props (`stroke`, `fill`, `stopColor`, `contentStyle`), not as classNames.
 * A token swap in globals.css therefore does not reach a single chart, so
 * four files each picked their own blue/green/violet and the charts drifted
 * away from the surfaces around them. Everything below is imported by all
 * four chart files; none of them may name a colour of its own.
 *
 * Why literals and not `var(--brand)`: the tokens in globals.css are *hsl
 * components* (`239 84% 67%`), not finished colours. `stroke="var(--brand)"`
 * resolves to the string `239 84% 67%`, which is not a colour, and the series
 * silently renders black. Reading them at runtime would mean wrapping each in
 * `hsl(...)` and re-reading after every theme change. So the values are
 * literal here, each tied to its token by name in the comment, and
 * scripts/check-parcel-g.ts fails if a literal appears in a chart file
 * instead.
 */

import * as React from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

/* --- Brand ramp and state colours, token for token --------------------- */
export const CHART_COLORS = {
  /** --brand / --primary / --info  #6366f1 */
  brand: '#6366f1',
  /** --brand-light  #818cf8 */
  brandLight: '#818cf8',
  /** --brand-dark  #4f46e5 */
  brandDark: '#4f46e5',
  /** --brand-deep  #4338ca */
  brandDeep: '#4338ca',
  /** --emerald / --success  #10b981 */
  emerald: '#10b981',
  /** --emerald-dark / --success-dark  #065f46 */
  emeraldDark: '#065f46',
  /** --warning  #f59e0b */
  warning: '#f59e0b',
  /** --warning-text / --warning-dark  #b45309 */
  warningDark: '#b45309',
  /** --error / --destructive  #ef4444 */
  error: '#ef4444',
  /** --error-dark  #dc2626 */
  errorDark: '#dc2626',
  /** --ink-faint  #64748b — axis labels and the neutral series */
  inkFaint: '#64748b',
  /** --ink-body  #334155 — chart body copy */
  inkBody: '#334155',
  /** --ink-strong  #0f172a */
  inkStrong: '#0f172a',
} as const;

/**
 * Categorical series order. Indigo first, then emerald, then the indigo ramp,
 * so two adjacent slices never read as the same hue-and-weight. State colours
 * (warning, error) come last, because in this product amber and red mean
 * "needs attention" everywhere else and must not be spent on an ordinary
 * series while a neutral one is still free.
 */
export const CHART_SERIES = [
  CHART_COLORS.brand,
  CHART_COLORS.emerald,
  CHART_COLORS.brandLight,
  CHART_COLORS.brandDeep,
  CHART_COLORS.inkFaint,
  CHART_COLORS.warning,
] as const;

/** Plans are a tier ladder, so they get one ramp, not six unrelated hues. */
export const PLAN_CHART_COLORS: Record<string, string> = {
  free: CHART_COLORS.inkFaint,
  starter: CHART_COLORS.brandLight,
  professional: CHART_COLORS.brand,
  pro: CHART_COLORS.brand,
  enterprise: CHART_COLORS.brandDeep,
};

export const planColor = (plan: string) =>
  PLAN_CHART_COLORS[plan?.toLowerCase()] ?? CHART_COLORS.inkFaint;

/** Check status keeps the app's status vocabulary — same word, same colour. */
export const CHECK_STATUS_COLORS: Record<string, string> = {
  pending_review: CHART_COLORS.warning,
  approved: CHART_COLORS.emerald,
  exported: CHART_COLORS.brand,
  rejected: CHART_COLORS.error,
  duplicate: CHART_COLORS.warningDark,
  error: CHART_COLORS.errorDark,
};

export const statusColor = (status: string) =>
  CHECK_STATUS_COLORS[status] ?? CHART_COLORS.inkFaint;

/* --- Chrome: axes, grid, tooltip, legend -------------------------------- */

/**
 * Axis labels sit on a translucent card, so they get --ink-faint (4.6:1 on
 * white), not the old #9ca3af (2.8:1) which disappeared the moment the card
 * stopped being opaque.
 */
export const AXIS_TICK = { fill: CHART_COLORS.inkFaint, fontSize: 11 } as const;

/** Slightly smaller tick for dense category axes. Same colour. */
export const AXIS_TICK_SM = { fill: CHART_COLORS.inkFaint, fontSize: 10 } as const;

/**
 * Gridlines are the thing that most easily goes wrong on glass: the hairline
 * token (rgba(15,23,42,0.07)) vanishes behind a 0.72-alpha surface, and a
 * solid grey shouts over it. 0.10 is the value that stays visible on the
 * mesh without competing with the series.
 */
export const GRID_STROKE = 'rgba(15, 23, 42, 0.10)';

/** Spread onto <CartesianGrid>. Horizontal only — vertical rules read as a spreadsheet. */
export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: GRID_STROKE,
  vertical: false,
} as const;

/**
 * The tooltip is a popover, so it follows the modal tier: near-opaque, not
 * translucent. Recharts renders it in a plain div with no backdrop-filter,
 * so a 0.72 alpha here would just be unreadable rather than glassy.
 */
export const TOOLTIP_STYLE = {
  background: 'rgba(255, 255, 255, 0.96)',
  border: '1px solid rgba(15, 23, 42, 0.07)', // --glass-hairline
  borderRadius: 14, // --radius-input
  boxShadow: '0 2px 4px rgba(15,23,42,0.06), 0 24px 60px rgba(15,23,42,0.18)', // --shadow-glass-modal
  fontSize: 12,
  color: CHART_COLORS.inkStrong,
  padding: '8px 12px',
} as const;

export const TOOLTIP_LABEL_STYLE = {
  color: CHART_COLORS.inkFaint,
  fontSize: 11,
  marginBottom: 2,
} as const;

/** Spread onto <Tooltip>. The cursor band must not look like a selection. */
export const TOOLTIP_PROPS = {
  contentStyle: TOOLTIP_STYLE,
  labelStyle: TOOLTIP_LABEL_STYLE,
  cursor: { fill: 'rgba(99, 102, 241, 0.06)' }, // --brand at 6%
} as const;

export const LEGEND_STYLE = { fontSize: 11, color: CHART_COLORS.inkBody } as const;

/**
 * Spread onto every series (Area, Bar, Line, Pie).
 *
 * Recharts' entrance is a JS tween, and DESIGN-SYSTEM 4.4 is explicit that
 * entrances are CSS keyframes, never JS tweens — the card's own
 * `animate-glass-rise` already carries the entrance. Three concrete reasons
 * the tween has to go here specifically:
 *
 *  - Pie suppresses its labels entirely until `isAnimationFinished`, so a
 *    stalled tween is a chart with no labels at all.
 *  - It is rAF-driven, so it stalls whenever the tab is not painting and the
 *    chart is left frozen part-drawn.
 *  - It restarts on every re-render, and these dashboards re-render on every
 *    date-range and plan-filter change, so the figures re-animate each time
 *    the reader changes a filter they are trying to read.
 *
 * It also ignores `prefers-reduced-motion`, which the rest of the system
 * honours.
 */
export const NO_TWEEN = { isAnimationActive: false } as const;

/**
 * Pie slice labels.
 *
 * Recharts' default pie label inherits the SLICE's fill, which is how chart
 * contrast quietly fails: amber #f59e0b on a white card is 2.1:1 and emerald
 * #10b981 is 2.5:1, both far under 4.5:1 — the slice reads fine and its own
 * label is barely there. This renders the label in --ink-body instead, so
 * colour stays on the slice where it carries meaning and the text stays
 * legible whatever the slice is.
 */
export function pieLabel(props: any) {
  const { x, y, textAnchor, name, percent, cx, cy, midAngle, innerRadius, outerRadius } = props;
  const pct = `${(percent * 100).toFixed(0)}%`;

  /* Below ~420px the ring leaves roughly 50px either side, which does not
     hold a word like "professional" — the label then renders half off the
     card. So on a narrow chart the percentage moves INSIDE the ring, where it
     always fits, and the category name is carried by the tooltip. The desktop
     label is unchanged.
     The width is read off `cx`, not off a `width` prop: Recharts does not pass
     its chart width down into the label props (checked in the browser), but
     the pie is always centred at cx="50%", so cx IS half the plot width. */
  if (cx && cx < 210) {
    const r = (Number(innerRadius) + Number(outerRadius)) / 2;
    const rad = (-Number(midAngle) * Math.PI) / 180;
    return (
      <text
        x={cx + r * Math.cos(rad)}
        y={cy + r * Math.sin(rad)}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        fontSize={10}
        fontWeight={600}
      >
        {pct}
      </text>
    );
  }

  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      fill={CHART_COLORS.inkBody}
      fontSize={11}
    >
      {`${name} ${pct}`}
    </text>
  );
}

/**
 * The leader line that goes with `pieLabel`. It has to branch on the same
 * width, or a narrow chart keeps drawing leaders out to labels that are no
 * longer there.
 */
export function pieLabelLine(props: any) {
  const { points, stroke } = props;
  // Same cx test as pieLabel — see the note there.
  const cx = props.cx;
  if (!points || (cx && cx < 210)) return <path d="" />;
  const d = `M${points.map((p: any) => `${p.x},${p.y}`).join('L')}`;
  return <path d={d} stroke={stroke} fill="none" />;
}

/* --- The frame ---------------------------------------------------------- */

/**
 * ChartFrame — every chart in the app goes through here.
 *
 * `ResponsiveContainer` measures its parent. Inside a glass card, which has
 * `backdrop-filter` and `overflow-hidden`, a parent with no resolved height
 * measures 0 and the chart renders as nothing at all — invisible in source,
 * invisible in a build, only visible in a browser. Declaring the height on
 * the wrapper here makes that failure structurally impossible, which is why
 * no page is allowed to mount a bare ResponsiveContainer.
 *
 * The height is an inline style on purpose: it is a number, per chart, and
 * Tailwind cannot generate an arbitrary class from a runtime value.
 */
export function ChartFrame({
  height = 240,
  className,
  children,
}: {
  height?: number;
  className?: string;
  children: React.ReactElement;
}) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Same footprint as a ChartFrame, for the "no data yet" case. */
export function ChartEmpty({
  height = 240,
  children,
}: {
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex w-full items-center justify-center gap-2 text-sm text-ink-faint"
      style={{ height }}
    >
      {children}
    </div>
  );
}

/**
 * A vertical fade under an area series. Two charts on one page sharing an id
 * would share one gradient, so the id always comes from the call site.
 *
 * This is a plain function called as `{areaFade('x', c)}`, NOT a component
 * used as `<AreaFade />`, and that distinction is load-bearing: Recharts
 * walks its own children and only passes through the host elements it knows,
 * so a custom component wrapping `<defs>` is dropped silently. The gradient
 * then never exists, `fill="url(#x)"` resolves to nothing, and every area
 * renders as a bare stroke with no fill — which is exactly what the browser
 * check caught. Calling it inlines the real `<defs>` element instead.
 */
export function areaFade(id: string, color: string) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={0.22} />
        <stop offset="95%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}
