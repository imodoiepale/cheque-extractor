/**
 * The Kyriq mark, in one place.
 *
 * Both variants read the brand from the tokens (`--brand`, `--brand-light`,
 * `--emerald`, `--shell-solid`) through arbitrary properties rather than
 * carrying hex literals, so a brand change is still a one-file change.
 * The stops need a CSS *property* (`stop-color`), which is why these are
 * classNames and not SVG presentation attributes — `var()` does not resolve
 * inside a presentation attribute.
 */
import { cn } from '@/lib/utils';

export function KyriqIcon({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="kStem" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" className="[stop-color:hsl(var(--emerald))]" />
          <stop offset="100%" className="[stop-color:hsl(var(--brand))]" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" className="[fill:hsl(var(--shell-solid))]" />
      <rect x="22" y="20" width="11" height="60" rx="5.5" fill="url(#kStem)" />
      <line x1="33" y1="50" x2="68" y2="20" strokeWidth="11" strokeLinecap="round" className="[stroke:hsl(var(--emerald))]" />
      <line x1="33" y1="50" x2="68" y2="80" strokeWidth="11" strokeLinecap="round" className="[stroke:hsl(var(--brand))]" />
    </svg>
  );
}

/** The mark on the dark shell: lighter stops, translucent tile. */
export function KyriqIconWhite({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={cn(className)} aria-hidden>
      <defs>
        <linearGradient id="kStemW" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" className="[stop-color:hsl(var(--emerald))]" />
          <stop offset="100%" className="[stop-color:hsl(var(--brand-light))]" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" className="[fill:rgba(255,255,255,0.07)]" />
      <rect x="22" y="20" width="11" height="60" rx="5.5" fill="url(#kStemW)" />
      <line x1="33" y1="50" x2="68" y2="20" strokeWidth="11" strokeLinecap="round" className="[stroke:hsl(var(--emerald))]" />
      <line x1="33" y1="50" x2="68" y2="80" strokeWidth="11" strokeLinecap="round" className="[stroke:hsl(var(--brand-light))]" />
    </svg>
  );
}
