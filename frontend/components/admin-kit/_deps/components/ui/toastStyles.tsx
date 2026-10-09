'use client';
import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import {
  AlertTriangle,
  CheckCircle,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * The *appearance* half of the toast system.
 *
 * ToastProvider owns behaviour (queue, max 5, auto-dismiss, safe-area container)
 * and hands each toast to one of the variants below, which own nothing but
 * looks. Splitting them this way is what lets the style be swapped at runtime
 * from an admin flag without touching a single one of the ~38 call sites.
 */

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastStyleId =
  | "dynamic-island"
  | "glassmorphic"
  | "apple"
  | "dark-minimal"
  | "gradient-glow"
  | "neumorphic";

/** The island is the house style — everything else is opt-in via the admin
 *  flag. It replaced glassmorphic on 27 Sep 2026 (see 00 below). */
export const DEFAULT_TOAST_STYLE: ToastStyleId = "dynamic-island";

/**
 * feature_flags row that carries the choice, mirroring `voice_script_variant`:
 * the value lives in `targeting_rules.variant`, not in `enabled`.
 *
 * NOTE: the flag row must have `enabled = true` — the `auth_read_enabled_flags`
 * RLS policy only exposes enabled rows to non-admin users, so a disabled row is
 * invisible to the app and every toast silently falls back to glassmorphic.
 */
export const TOAST_STYLE_FLAG_KEY = "toast_style";

/** Ordered for the admin picker; the numbering matches the design sheet. */
export const TOAST_STYLE_OPTIONS: {
  id: ToastStyleId;
  label: string;
  hint: string;
}[] = [
  { id: "dynamic-island", label: "Dynamic Island", hint: "Capsule that unfolds from the top" },
  { id: "glassmorphic", label: "Glassmorphic", hint: "Blur + glow ring" },
  { id: "apple", label: "Apple Native", hint: "Light, system-like" },
  { id: "dark-minimal", label: "Dark Minimal", hint: "Flat, hairline border" },
  { id: "gradient-glow", label: "Gradient Glow", hint: "Bold fill, outer glow" },
  { id: "neumorphic", label: "Soft Neumorphic", hint: "Light, soft depth" },
];

/** Anything unknown (typo, older/newer client, missing row) lands on glass. */
export function resolveToastStyle(raw: unknown): ToastStyleId {
  return TOAST_STYLE_OPTIONS.some((o) => o.id === raw)
    ? (raw as ToastStyleId)
    : DEFAULT_TOAST_STYLE;
}

interface TypeConfig {
  icon: LucideIcon;
  /** Accent on the dark surfaces (01, 03). */
  dark: string;
  /** Accent on the light surfaces (02, 05) — darkened so it stays legible. */
  light: string;
  /** Fill for Gradient Glow (04); the first stop also drives its outer glow. */
  gradient: [string, string];
}

/**
 * One icon + colour per type, kept in a single table so the four types read the
 * same across all five variants. Info is blue rather than the brand violet: on
 * the gradient and light surfaces violet reads as "primary action", not "FYI".
 */
export const TOAST_TYPES: Record<ToastType, TypeConfig> = {
  success: {
    icon: CheckCircle,
    dark: "#34D399",
    light: "#15803D",
    gradient: ["#10B981", "#047857"],
  },
  error: {
    icon: XCircle,
    dark: "#F87171",
    light: "#B91C1C",
    gradient: ["#F87171", "#DC2626"],
  },
  info: {
    icon: Info,
    dark: "#60A5FA",
    light: "#1D4ED8",
    gradient: ["#60A5FA", "#4F46E5"],
  },
  warning: {
    icon: AlertTriangle,
    dark: "#F2CC66",
    light: "#A16207",
    gradient: ["#FBBF24", "#D97706"],
  },
};

export interface ToastVisualProps {
  type: ToastType;
  title: string;
  message?: string;
  /** Overrides the type's default icon; falls back to TOAST_TYPES when absent. */
  icon?: LucideIcon;
  /** Pre-formatted relative age ("Now", "1m"). Absent = caller opted out. */
  timestamp?: string;
  onDismiss: () => void;
  dismissLabel: string;
}

/** Colours for the shared text column, so each variant only states its palette. */
interface Tone {
  title: string;
  message: string;
  timestamp: string;
}

/**
 * The anatomy every variant shares: leading chip, bold title, muted one-line
 * description, right-aligned timestamp, dismiss button. Variants supply the
 * surface and the chip; nothing else about the layout is theirs to change.
 */
function ToastFrame({
  className,
  style,
  chip,
  tone,
  title,
  message,
  timestamp,
  onDismiss,
  dismissLabel,
}: ToastVisualProps & {
  className?: string;
  style?: CSSProperties;
  chip: ReactNode;
  tone: Tone;
  // `type` and `icon` ride along on the variants' `{...props}` spread; the
  // frame ignores them — resolving them is the variant's job.
}) {
  return (
    <div
      className={`relative flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ${className ?? ""}`}
      style={style}
    >
      {chip}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className="min-w-0 flex-1 truncate text-[14px] leading-tight font-semibold"
            style={{ color: tone.title }}
          >
            {title}
          </p>
          {timestamp && (
            <span
              className="shrink-0 text-[13.5px] leading-tight font-medium tabular-nums"
              style={{ color: tone.timestamp }}
            >
              {timestamp}
            </span>
          )}
        </div>
        {message && (
          <p
            className="mt-0.5 truncate text-[14px] leading-snug"
            style={{ color: tone.message }}
          >
            {message}
          </p>
        )}
      </div>

      <button
        onClick={onDismiss}
        className="dm-press grid min-h-8 min-w-8 shrink-0 place-items-center rounded-full opacity-60 transition-opacity hover:opacity-100 active:scale-[0.97]"
        style={{ color: tone.timestamp }}
        aria-label={dismissLabel}
      >
        <X size={13} />
      </button>
    </div>
  );
}

/** Resolves the icon once — every variant needs the same fallback logic. */
function resolveIcon(props: ToastVisualProps): LucideIcon {
  return props.icon ?? TOAST_TYPES[props.type].icon;
}

/* ── 01 Glassmorphic ──────────────────────────────────────────────────────
   Translucent blurred surface; the type colour lives entirely in a glowing
   ring around the leading icon, which is what separates it from 03. */
function GlassmorphicToast(props: ToastVisualProps) {
  const c = TOAST_TYPES[props.type].dark;
  const Icon = resolveIcon(props);

  return (
    <ToastFrame
      {...props}
      // dm-toast-surface: globals.css swaps the blur for an opaque fill under
      // prefers-reduced-transparency. Only this variant actually blurs.
      className="dm-toast-surface shadow-xl"
      style={{
        background: "rgba(20,20,28,0.72)",
        backdropFilter: "blur(30px) saturate(180%)",
        WebkitBackdropFilter: "blur(30px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
      }}
      tone={{
        title: "#FFFFFF",
        message: "rgba(255,255,255,0.5)",
        timestamp: "rgba(255,255,255,0.4)",
      }}
      chip={
        <div
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: 28,
            height: 28,
            backgroundColor: `${c}26`,
            boxShadow: `0 0 0 1px ${c}59, 0 0 14px 2px ${c}59`,
          }}
        >
          <Icon size={14} style={{ color: c }} strokeWidth={2.25} />
        </div>
      }
    />
  );
}

/* ── 02 Apple Native ──────────────────────────────────────────────────────
   Light card on a dark app, so the text column flips to near-black; the
   accent uses the darkened `light` ramp to survive the pale background. */
function AppleNativeToast(props: ToastVisualProps) {
  const c = TOAST_TYPES[props.type].light;
  const Icon = resolveIcon(props);

  return (
    <ToastFrame
      {...props}
      style={{
        background: "#F7F7F8",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.12)",
      }}
      tone={{
        title: "#111114",
        message: "rgba(60,60,67,0.62)",
        timestamp: "rgba(60,60,67,0.45)",
      }}
      chip={
        <div
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{ width: 28, height: 28, backgroundColor: `${c}1F` }}
        >
          <Icon size={14} style={{ color: c }} strokeWidth={2.25} />
        </div>
      }
    />
  );
}

/* ── 03 Dark Minimal ──────────────────────────────────────────────────────
   Flat fill, hairline border, bare icon — deliberately no chip and no glow. */
function DarkMinimalToast(props: ToastVisualProps) {
  const c = TOAST_TYPES[props.type].dark;
  const Icon = resolveIcon(props);

  return (
    <ToastFrame
      {...props}
      style={{
        background: "#14141C",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
      }}
      tone={{
        title: "rgba(255,255,255,0.92)",
        message: "rgba(255,255,255,0.45)",
        timestamp: "rgba(255,255,255,0.35)",
      }}
      chip={
        <div className="grid h-7 w-7 shrink-0 place-items-center">
          <Icon size={15} style={{ color: c }} strokeWidth={2} />
        </div>
      }
    />
  );
}

/* ── 04 Gradient Glow ─────────────────────────────────────────────────────
   Saturated per-type fill with an ambient glow in the same hue. Text is white
   throughout, so the chip is a white scrim rather than a coloured one. */
function GradientGlowToast(props: ToastVisualProps) {
  const [from, to] = TOAST_TYPES[props.type].gradient;
  const Icon = resolveIcon(props);

  return (
    <ToastFrame
      {...props}
      style={{
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        border: "1px solid rgba(255,255,255,0.18)",
        boxShadow: `0 8px 30px ${from}66, inset 0 1px 0 rgba(255,255,255,0.22)`,
      }}
      tone={{
        title: "#FFFFFF",
        message: "rgba(255,255,255,0.82)",
        timestamp: "rgba(255,255,255,0.7)",
      }}
      chip={
        <div
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: 28,
            height: 28,
            backgroundColor: "rgba(255,255,255,0.22)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.3)",
          }}
        >
          <Icon size={14} color="#FFFFFF" strokeWidth={2.4} />
        </div>
      }
    />
  );
}

/* ── 05 Soft Neumorphic ───────────────────────────────────────────────────
   Light surface with paired light/dark shadows; the chip is *inset* so it
   reads as pressed into the card rather than sitting on it. */
function NeumorphicToast(props: ToastVisualProps) {
  const c = TOAST_TYPES[props.type].light;
  const Icon = resolveIcon(props);

  return (
    <ToastFrame
      {...props}
      style={{
        background: "#ECEFF4",
        boxShadow:
          "6px 6px 16px rgba(147,161,185,0.55), -6px -6px 16px rgba(255,255,255,0.95), 0 6px 24px rgba(0,0,0,0.22)",
      }}
      tone={{
        title: "#1F2430",
        message: "rgba(31,36,48,0.6)",
        timestamp: "rgba(31,36,48,0.42)",
      }}
      chip={
        <div
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: 28,
            height: 28,
            backgroundColor: "#ECEFF4",
            boxShadow:
              "inset 3px 3px 6px rgba(147,161,185,0.6), inset -3px -3px 6px rgba(255,255,255,0.95)",
          }}
        >
          <Icon size={14} style={{ color: c }} strokeWidth={2.25} />
        </div>
      }
    />
  );
}

/* ── 00 Dynamic Island ────────────────────────────────────────────────────
   A recreation of expo-dynamic-notifications (a React Native library; this
   app is a web bundle inside Capacitor, so the LOOK and the API are
   reproduced here rather than the package imported). Three parts:

     DynamicIslandPill      the black pill at the very top (islandWidth ×
                            islandHeight), present while any island is up.
     DynamicIslandCard      the notification. Enters as a droplet the size of
                            the pill, sitting where the pill is, and springs
                            down and open into the card (`expanded`), its
                            colour settling from islandColor to cardColor.
                            Its content blur-reveals once the shape is mostly
                            there.
     DynamicIslandGooFilter the SVG filter the provider wraps pill + newest
                            card in for the ~600ms of the morph. Gaussian
                            blur, then an alpha ramp (gain / threshold), then
                            the source composited `atop` — the two shapes read
                            as one liquid with a neck that stretches and
                            snaps, while text stays crisp. Same matrix the
                            library's Gooey layer applies.

   The geometry object carries the library's root props with its defaults;
   ToastProvider merges overrides. cardColor is dark here (the library's
   default is white) because the app is dark. */
export interface IslandGeometry {
  islandWidth: number;
  islandHeight: number;
  /** Offset below the safe-area top. */
  islandTop: number;
  islandColor: string;
  cardWidth: number;
  cardHeight: number;
  cardRadius: number;
  cardColor: string;
  shadowColor: string;
  /** Default title/symbol tint when a toast does not set `accent`; null =
   *  use the toast type's colour. */
  accent: string | null;
  /** Space between pill and card. */
  gap: number;
  /** Goo intensity 0–1; drives the blur radius. */
  strength: number;
  /** Explicit goo blur radius; overrides strength when set. */
  blur: number | null;
  /** Alpha gain of the goo colour matrix. */
  gain: number;
  /** Alpha cutoff of the goo colour matrix. */
  threshold: number;
  /** Default lifetime (ms); null = never auto-dismiss. */
  duration: number | null;
}

export const ISLAND_DEFAULTS: IslandGeometry = {
  islandWidth: 126,
  islandHeight: 37,
  islandTop: 8,
  islandColor: "#000000",
  cardWidth: 380,
  cardHeight: 74,
  cardRadius: 26,
  cardColor: "rgba(10, 11, 16, 0.96)",
  shadowColor: "rgba(0, 0, 0, 0.55)",
  accent: null,
  gap: 34,
  strength: 0.62,
  blur: null,
  gain: 22,
  threshold: 0.43,
  duration: 4000,
};

export function DynamicIslandGooFilter({ geometry }: { geometry: IslandGeometry }) {
  const blur = geometry.blur ?? geometry.strength * 14;
  const g = geometry.gain;
  const off = -geometry.threshold * g;
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        <filter id="dm-goo" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${g} ${off}`}
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

/** Where Apple draws the hardware Dynamic Island, in CSS px from the top of
 *  the screen, on every island iPhone since the 14 Pro. The pill is placed
 *  there so it MERGES with the hardware one rather than floating beneath it —
 *  which is the whole trick of the library's look on a real device. */
export const HARDWARE_ISLAND_TOP_PX = 11;
/** `--safe-top` at or above this means a notch or island device. Notch
 *  iPhones report 47; island iPhones 59. Android and the web report 0–30. */
export const ISLAND_SAFE_TOP_MIN_PX = 47;

export function DynamicIslandPill({
  geometry,
  reducedMotion,
}: {
  geometry: IslandGeometry;
  reducedMotion: boolean;
}) {
  const [dropped, setDropped] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setDropped(true));
    return () => cancelAnimationFrame(f);
  }, []);
  return (
    <div
      aria-hidden="true"
      data-testid="dm-island-pill"
      style={{
        width: geometry.islandWidth,
        height: geometry.islandHeight,
        borderRadius: 999,
        background: geometry.islandColor,
        boxShadow: `0 6px 18px ${geometry.shadowColor}`,
        transform: reducedMotion || dropped ? "scale(1)" : "scale(0.92)",
        opacity: reducedMotion || dropped ? 1 : 0,
        transition: reducedMotion ? "none" : "transform 260ms cubic-bezier(0.34, 1.4, 0.64, 1), opacity 160ms ease-out",
      }}
    />
  );
}

export interface DynamicIslandCardProps extends ToastVisualProps {
  accent?: string;
  avatar?: string;
  /** Custom body (the library's `render`); replaces title/message. */
  body?: ReactNode;
  geometry: IslandGeometry;
  /** false = droplet at the pill; true = open card below it. */
  expanded: boolean;
  reducedMotion: boolean;
}

export function DynamicIslandCard(props: DynamicIslandCardProps) {
  const { geometry: g, expanded, reducedMotion } = props;
  const accent = props.accent ?? g.accent ?? TOAST_TYPES[props.type].dark;
  const Icon = resolveIcon(props);
  // Where the droplet starts: centred on the pill, one gap above the card's
  // resting place. The card is in normal flow below the pill, so the offset
  // is the gap plus half the height difference.
  // The droplet starts INSIDE the pill's silhouette (its top edge on the
  // pill's top edge, transform-origin at the top) and falls away from it.
  // The first half of the curve is slow, so the two shapes overlap long
  // enough under the goo filter for a neck to form and stretch before it
  // snaps; the overshoot at the end is the settle.
  const rise = g.gap + g.islandHeight;
  const spring = "cubic-bezier(0.22, 1.35, 0.36, 1)";
  const shape: CSSProperties = reducedMotion
    ? { opacity: expanded ? 1 : 0, transition: "opacity 160ms ease-out" }
    : expanded
      ? {
          transform: "translateY(0) scale(1, 1)",
          borderRadius: g.cardRadius,
          background: g.cardColor,
          transition: `transform 680ms ${spring}, border-radius 520ms ease-out, background-color 600ms ease-out, opacity 160ms ease-out`,
        }
      : {
          transform: `translateY(-${rise}px) scale(${(g.islandWidth * 0.55) / g.cardWidth}, ${g.islandHeight / g.cardHeight})`,
          borderRadius: 999,
          background: g.islandColor,
          opacity: 1,
          transition: `transform 240ms cubic-bezier(0.4, 0, 1, 1), border-radius 200ms ease-in, background-color 240ms ease-in, opacity 180ms ease-in 60ms`,
        };
  const reveal: CSSProperties = reducedMotion
    ? {}
    : expanded
      ? { opacity: 1, filter: "blur(0px)", transform: "translateY(0)", transition: "opacity 280ms ease-out 260ms, filter 360ms ease-out 260ms, transform 360ms ease-out 260ms" }
      : { opacity: 0, filter: "blur(8px)", transform: "translateY(4px)", transition: "opacity 120ms ease-in, filter 120ms ease-in" };

  return (
    <div
      className="dm-toast-surface relative w-full overflow-hidden"
      style={{
        minHeight: g.cardHeight,
        transformOrigin: "50% 0%",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: `0 18px 44px ${g.shadowColor}, 0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px ${accent}22`,
        willChange: "transform, border-radius",
        ...shape,
      }}
    >
      <div className="flex min-h-[inherit] items-center gap-3 px-3.5 py-3" style={reveal}>
        {props.body ?? (
          <>
            {props.avatar ? (
              <Avatar className="size-10 shrink-0 ring-1 ring-white/10">
                <AvatarImage src={props.avatar} alt="" />
                <AvatarFallback className="bg-white/10">
                  <Icon size={16} style={{ color: accent }} strokeWidth={2.4} />
                </AvatarFallback>
              </Avatar>
            ) : (
              <div
                className="grid shrink-0 place-items-center rounded-full"
                style={{
                  width: 34,
                  height: 34,
                  background: `radial-gradient(circle at 30% 30%, ${accent}55, ${accent}1f 70%)`,
                  boxShadow: `0 0 0 1px ${accent}55, 0 0 18px 2px ${accent}40`,
                }}
              >
                <Icon size={16} style={{ color: accent }} strokeWidth={2.4} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="min-w-0 flex-1 truncate text-[14.5px] leading-tight font-semibold" style={{ color: accent }}>
                  {props.title}
                </p>
                {props.timestamp && (
                  <span className="shrink-0 text-[12px] leading-tight font-medium tabular-nums text-white/40">
                    {props.timestamp}
                  </span>
                )}
              </div>
              {props.message && (
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-white/70">
                  {props.message}
                </p>
              )}
            </div>
            {props.avatar && (
              // The library's `symbol`: with an avatar on the left, the glyph
              // moves to the right.
              <div className="grid shrink-0 place-items-center" data-testid="dm-island-symbol">
                <Icon size={18} style={{ color: accent }} strokeWidth={2.2} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Registry entry for the admin skin picker. Never rendered directly — the
 *  provider renders DynamicIslandCard with the geometry — but the map type
 *  wants a component per id, and this keeps the older code paths honest. */
function DynamicIslandToast(props: ToastVisualProps) {
  return (
    <DynamicIslandCard {...props} geometry={ISLAND_DEFAULTS} expanded reducedMotion />
  );
}

export const TOAST_STYLES: Record<
  ToastStyleId,
  ComponentType<ToastVisualProps>
> = {
  "dynamic-island": DynamicIslandToast,
  glassmorphic: GlassmorphicToast,
  apple: AppleNativeToast,
  "dark-minimal": DarkMinimalToast,
  "gradient-glow": GradientGlowToast,
  neumorphic: NeumorphicToast,
};
