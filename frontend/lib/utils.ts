import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to be told about this project's custom theme keys.
 *
 * Out of the box it only knows Tailwind's stock scales, so a custom key is an
 * unrecognised class it cannot place in a conflict group. `twMerge("min-h-btn
 * min-h-0")` therefore returns BOTH classes rather than the last one, and since
 * `min-h-btn` (3rem) is defined later in the stylesheet than `min-h-0`, the
 * primitive wins and the caller's override silently does nothing.
 *
 * That is not theoretical. A parcel overriding a Button's height with
 * `className="min-h-0 px-2.5 py-1 text-xs"` for a dense toolbar got a 44px
 * button anyway, and only found out by measuring a row in the browser — it cost
 * 11.5px of row height in a table. Every one of the keys below is a trap of the
 * same shape, because every one of them is used by a primitive and is the sort
 * of thing a call site reasonably overrides.
 *
 * Verified with: twMerge("min-h-btn min-h-0") -> "min-h-0" (was both).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "min-h": [{ "min-h": ["btn", "tap", "input"] }],
      rounded: [{ rounded: ["input", "btn", "pill", "card", "modal", "tile"] }],
      duration: [{ duration: ["tap", "quick", "settle", "reveal", "pop"] }],
      ease: [{ ease: ["settle", "spring", "exit"] }],
      scale: [{ scale: ["press", "press-sm", "pop"] }],
      opacity: [{ opacity: ["disabled"] }],
      "font-size": [{ text: ["eyebrow"] }],
      shadow: [
        {
          shadow: [
            "hairline",
            "contact",
            "glass",
            "glass-hover",
            "glass-panel",
            "glass-modal",
            "glass-sheet",
            "glass-toast",
            "glass-selected",
            "brand-glow",
            "danger-glow",
            "inner-track",
            "bevel",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
