// Ticks the cleared "C" on QuickBooks reconcile rows.
//
// One row at a time, because QuickBooks re-renders the table after each tick and
// a click on a stale button is lost. Each key is clicked at most once: the button
// is a toggle, so a second click on a row QuickBooks has already ticked would
// untick it. A click that can't be confirmed is reported, never retried.
globalThis.kyriqTickRows = async function kyriqTickRows(keys, { findButton, clicked, timeoutMs = 3000, pollMs = 100 }) {
  const pressed = key => findButton(key)?.getAttribute('aria-pressed') === 'true';
  const confirmed = [];
  const unconfirmed = [];

  for (const key of keys) {
    if (clicked.has(key)) continue;
    const button = findButton(key); // looked up now: an earlier tick may have replaced it
    if (!button) continue;          // not on screen: try again on the next run
    clicked.add(key);
    if (pressed(key)) continue;
    button.click();

    const deadline = Date.now() + timeoutMs;
    while (!pressed(key) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    (pressed(key) ? confirmed : unconfirmed).push(key);
  }
  return { confirmed, unconfirmed };
};
