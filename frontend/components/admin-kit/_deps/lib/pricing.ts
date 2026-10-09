/**
 * DISPLAY prices for the DepthMe subscription — one place, on purpose.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * STRIPE IS THE SOURCE OF TRUTH FOR WHAT IS ACTUALLY CHARGED.
 * ────────────────────────────────────────────────────────────────────────────
 * Nothing in this file can change a customer's bill. The web checkout session is
 * built from the STRIPE_MONTHLY_PRICE_ID / STRIPE_YEARLY_PRICE_ID environment
 * variables inside `supabase/functions/create-checkout-session`, and the native
 * apps charge whatever Apple/Google have on the product in App Store Connect and
 * Play Console (surfaced through RevenueCat — see `getOfferingPrices()` in
 * src/lib/purchases.ts, which OVERRIDES the strings below whenever the store
 * answers). These constants only control what we *say* the price is, in the
 * paywall copy and in the owner-facing admin dashboards.
 *
 * That means they can drift from reality, and the only defence is that there is
 * exactly one of them. Before this module the numbers were copy-pasted into
 * ProfitCalculatorPage, RevenuePage (twice), UserDetailDrawer and the i18n
 * bundle independently, so a price change was a scavenger hunt and the admin
 * pages disagreed with each other about the plan price. When Stripe changes,
 * change this file (and the en/premium.json price strings, which are localised
 * and therefore have to carry their own currency formatting).
 */

/** Monthly plan, USD. */
export const PRICE_MONTHLY_USD = 14.99;

/** Annual plan, USD. */
export const PRICE_YEARLY_USD = 99.99;

/** What a year costs if bought monthly — the honest comparison basis. */
export const YEARLY_AT_MONTHLY_RATE_USD = PRICE_MONTHLY_USD * 12; // 179.88

/**
 * The annual plan expressed per month, for the "Only $8.33/month" line.
 * 99.99 / 12 = 8.3325 → 8.33.
 */
export const PRICE_YEARLY_PER_MONTH_USD =
  Math.round((PRICE_YEARLY_USD / 12) * 100) / 100; // 8.33

/**
 * How much the annual plan saves against twelve monthly payments, as a whole
 * percent. 1 − (99.99 / 179.88) = 0.4442 → 44.42%.
 *
 * `floor`, never `round`: an advertised saving that rounds UP is a claim we
 * can't substantiate, so the badge under-promises by design. At today's prices
 * floor and round agree (44), but the rule survives the next price change.
 */
export const YEARLY_SAVINGS_PCT = Math.floor(
  (1 - PRICE_YEARLY_USD / YEARLY_AT_MONTHLY_RATE_USD) * 100,
); // 44

/** `9.99` → `"$9.99"`. Deliberately USD-only — see the localisation note above. */
export const formatUsd = (amount: number) => `$${amount.toFixed(2)}`;
