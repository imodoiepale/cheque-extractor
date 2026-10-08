/* Kyriq extension — settings page.
 *
 * This logic used to live in an inline <script> in options.html, where MV3's
 * extension-page CSP blocked it outright: the page rendered but neither load()
 * nor the save handler ever ran. External file, so it runs.
 *
 * Nothing secret is stored here. The Supabase anon key is a public client key,
 * and the Intuit client secret is never in extension code — QuickBooks token
 * refresh is proxied through the Kyriq API, server-side.
 */

const $ = (id) => document.getElementById(id);

const show = (el, msg) => {
  if (msg !== undefined) el.textContent = msg;
  el.classList.add('is-shown');
};
const hide = (el) => el.classList.remove('is-shown');

/** Trust boundary: these three values become the base of every later fetch. */
function validate({ supabaseUrl, supabaseAnonKey, backendUrl }) {
  if (!supabaseUrl || !supabaseAnonKey) return 'Supabase URL and Anon Key are both required.';
  for (const [label, url] of [['Supabase URL', supabaseUrl], ['Railway App URL', backendUrl]]) {
    if (!url) continue;
    let parsed;
    try { parsed = new URL(url); } catch { return `${label} is not a valid URL.`; }
    // http is allowed only for a local dev host, matching manifest host_permissions.
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
      return `${label} must start with https:// (http:// only for localhost).`;
    }
  }
  return null;
}

async function load() {
  const { bootstrapConfig, session } = await chrome.storage.local.get(['bootstrapConfig', 'session']);

  if (bootstrapConfig) {
    $('cfg-supabase-url').value = bootstrapConfig.supabaseUrl || '';
    $('cfg-supabase-key').value = bootstrapConfig.supabaseAnonKey || '';
    $('cfg-backend-url').value = bootstrapConfig.backendUrl || '';
  }

  if (session?.user?.email) {
    $('account-card').style.display = 'block';
    $('user-email').textContent = session.user.email;
  }
}

$('btn-save').addEventListener('click', async () => {
  const errEl = $('error-msg');
  const okEl = $('success-msg');
  hide(errEl);
  hide(okEl);

  const cfg = {
    supabaseUrl: $('cfg-supabase-url').value.trim().replace(/\/$/, ''),
    supabaseAnonKey: $('cfg-supabase-key').value.trim(),
    backendUrl: $('cfg-backend-url').value.trim().replace(/\/$/, ''),
  };

  const problem = validate(cfg);
  if (problem) { show(errEl, problem); return; }

  await chrome.storage.local.set({ bootstrapConfig: cfg });
  await chrome.storage.local.remove('configCache');

  show(okEl);
  setTimeout(() => hide(okEl), 3000);
});

load();
