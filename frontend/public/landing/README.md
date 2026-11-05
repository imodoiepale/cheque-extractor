# Kyriq landing-page image assets

## Responsive rebuild assets



`statement-to-quickbooks-kyriq-v6.webp` is the production workflow artwork regenerated with the supplied official Kyriq icon as a reference. The complete green-and-white mark is rendered within the central cube face and follows its perspective, glass depth, reflections, and lighting instead of appearing as a flat overlay.

Generated visual direction for the Kyriq landing-page revamp. Keep headings,
body copy, navigation, pricing, controls, and accessibility labels in HTML.

| Asset | Dimensions | Intended use |
| --- | ---: | --- |
| `hero-match-sculpture-4k-v1.webp` | 3840 x 2160 | Hero ambient background |
| `quickbooks-comparisons-real.webp` | 2376 x 1062 | Hero product screenshot, the real app with demo data |
| `workflow-background-4k-v1.webp` | 3840 x 2160 | How-it-works section background |
| `firms-background-4k-v1.webp` | 3840 x 2160 | Accounting-firms section background |
| `quickbooks-extension-4k-v1.webp` | 3840 x 2160 | Chrome extension showcase |
| `pricing-background-4k-v1.webp` | 3840 x 2160 | Pricing section background |
| `faq-background-4k-v1.webp` | 3840 x 2160 | FAQ section background |
| `closing-cta-ribbons-4k-v1.webp` | 3840 x 2160 | Final CTA background |

The Voice artwork treats Kyriq and QuickBooks as premium anthropomorphic
financial-intelligence characters. It intentionally leaves final approval as a
human action.

## Format

Everything here is WebP, capped at 2560px. It arrived as 3840px PNGs totalling
~86MB, a third of it superseded iterations nothing referenced; the same art is
now 1.15MB. next/image never upscales past the source, so the only place 2560
costs anything is a full-bleed 4K display, and these are out-of-focus backdrops.
The two product shots are saved at a higher quality because they show UI text.

Regenerate with `python frontend/scripts/compress-landing-art.py --apply`
(run it without the flag first — it reports and changes nothing).

Brand marks are still rendered by the UI from the SVGs in `public/brand`, never
baked into this raster art.
