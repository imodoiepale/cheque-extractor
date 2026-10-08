/**
 * The ambient gradient mesh that every glass surface refracts.
 *
 * Mounted once, in the root layout. Glass over a flat page reads as a
 * rendering bug, so this is load-bearing, not decoration.
 *
 * Pure CSS: two blurred colour fields on prime-ratio loops (60s / 75s) plus a
 * grain overlay built from two mismatched tiled gradients. No client JS, no
 * network cost, animates `transform` only. See app/globals.css `.ambient-*`.
 */
export function AmbientBackground({ tone }: { tone?: 'brand' | 'success' | 'calm' }) {
  return (
    <div className="ambient-mesh" aria-hidden="true" data-tone={tone}>
      <div className="ambient-field ambient-field-a" />
      <div className="ambient-field ambient-field-b" />
      <div className="ambient-grain" />
    </div>
  );
}

export default AmbientBackground;
