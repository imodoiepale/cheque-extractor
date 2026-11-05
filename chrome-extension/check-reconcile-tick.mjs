#!/usr/bin/env node
// `node chrome-extension/check-reconcile-tick.mjs`
// Fake QuickBooks buttons for the failures seen on the reconcile page.
import assert from 'node:assert/strict';
await import('./content/reconcile-tick.js');
const tick = globalThis.kyriqTickRows;
const fast = { timeoutMs: 30, pollMs: 2 };

// A toggle like QuickBooks': each click flips it. `render` swaps the element.
function table(keys, { loseClicks = [] } = {}) {
  const on = Object.fromEntries(keys.map(k => [k, false]));
  const clicks = Object.fromEntries(keys.map(k => [k, 0]));
  let renders = 0;
  const button = (key, render) => ({
    getAttribute: () => String(on[key]),
    click() {
      assert.equal(render, renders, `clicked a stale button for ${key}`);
      clicks[key]++;
      if (loseClicks.includes(key)) return;
      setTimeout(() => { on[key] = !on[key]; renders++; }, 5);
    },
  });
  return { on, clicks, findButton: key => (key in on ? button(key, renders) : null) };
}

// Re-render after every tick: all rows end up ticked, with no stale clicks.
{
  const t = table(['a', 'b', 'c']);
  const r = await tick(['a', 'b', 'c'], { ...fast, findButton: t.findButton, clicked: new Set() });
  assert.deepEqual(r.confirmed, ['a', 'b', 'c']);
  assert.deepEqual(t.on, { a: true, b: true, c: true });
}

// The 60-second re-run must not toggle anything back off.
{
  const t = table(['a', 'b']);
  const clicked = new Set();
  await tick(['a', 'b'], { ...fast, findButton: t.findButton, clicked });
  const again = await tick(['a', 'b'], { ...fast, findButton: t.findButton, clicked });
  assert.deepEqual(again, { confirmed: [], unconfirmed: [] });
  assert.deepEqual(t.clicks, { a: 1, b: 1 });
}

// A lost click is reported, not retried, and doesn't stop the next row.
{
  const t = table(['a', 'b'], { loseClicks: ['a'] });
  const clicked = new Set();
  const r = await tick(['a', 'b'], { ...fast, findButton: t.findButton, clicked });
  assert.deepEqual(r, { confirmed: ['b'], unconfirmed: ['a'] });
  await tick(['a', 'b'], { ...fast, findButton: t.findButton, clicked });
  assert.equal(t.clicks.a, 1);
}

// A row not on screen isn't used up, so a later run can still tick it.
{
  const t = table(['a']);
  const clicked = new Set();
  await tick(['missing'], { ...fast, findButton: t.findButton, clicked });
  assert.equal(clicked.has('missing'), false);
}

console.log('reconcile tick checks passed');
