/**
 * Self-check for the one QuickBooks token resolver and the two switchers
 * (CHECKLIST section 4, plus the refactor that had to happen first).
 *
 *   cd frontend && npx tsx scripts/check-qb-switchers.ts
 *
 * No test framework on purpose. Half of this is BEHAVIOUR — getQbToken() is
 * driven against a fake Supabase client and a stubbed fetch, so the assertions
 * are about what it does, not about what its source looks like. The other half
 * has to read source, because "no file regained its own token exchange" is a
 * statement about the repository and cannot be observed from inside one call.
 *
 * The source half strips comments first. Four assertions in this project have
 * already passed vacuously by matching a doc comment, an import, a helper name
 * on an irrelevant branch, or a literal control character pasted from a
 * heredoc, so: comments go, and call shapes are asserted whole.
 */
import assert from 'node:assert/strict';
import { getQbToken } from '../lib/qb-token';
import { warrantsReconnectEmail } from '../lib/qb-health';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');

const readRepo = (rel: string) => readFileSync(path.join(repo, rel), 'utf8');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/** Block and line comments out, so no assertion can be satisfied by prose. */
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const code = (rel: string) => strip(read(rel));

const ok = (msg: string) => console.log(`  ok  ${msg}`);

const RESOLVER = 'lib/qb-token.ts';

/**
 * The eleven sites. Every one of these performed its own
 * `grant_type: 'refresh_token'` exchange before this parcel.
 */
const CALL_SITES = [
  'lib/match-helpers.ts',
  'pages/api/qbo/pull-checks.ts',
  'pages/api/extension/qb/refresh-token.ts',
  'pages/api/qbo/clear-transaction.ts',
  'pages/api/qbo/create-check.ts',
  'pages/api/qbo/diagnose.ts',
  'pages/api/qbo/update-transaction.ts',
  'pages/api/qbo/accounts.ts',
  'pages/api/qbo/company-info.ts',
  'pages/api/qbo/explore.ts',
  'pages/api/qbo/preview.ts',
];

/* ══ 1. ONE token exchange in the whole frontend ═══════════════════════════ */
{
  for (const rel of CALL_SITES) {
    const src = code(rel);
    assert.doesNotMatch(
      src,
      /grant_type:\s*'refresh_token'/,
      `${rel} grew its own token exchange back — call getQbToken() from ${RESOLVER} instead`
    );
    // The import alone is not enough: an import with no call is exactly the
    // mutant that survived here once already.
    assert.match(
      src,
      /\b(?:getQbToken|getQbAccessToken)\s*\(/,
      `${rel} must actually CALL the resolver, not merely import it`
    );
  }
  assert.match(
    code(RESOLVER),
    /grant_type:\s*'refresh_token'/,
    `${RESOLVER} is the one place the Intuit exchange may live`
  );
  ok(`${CALL_SITES.length} call sites call the one resolver and none performs its own exchange`);
}

/* ══ 2. Nobody reads `integrations` without qb_connections ════════════════ */
{
  // The drift that was wrong in production: four routes read ONLY the legacy
  // single-company table, so they operated on the wrong company for any firm
  // with more than one connected.
  for (const rel of [RESOLVER, ...CALL_SITES]) {
    const src = code(rel);
    if (!/from\('integrations'\)/.test(src)) continue;
    assert.match(
      src,
      /from\('qb_connections'\)/,
      `${rel} reads the legacy integrations table without qb_connections — that is the wrong company for a multi-company firm`
    );
  }
  // And the resolver reaches for qb_connections FIRST, not as a fallback.
  // Measured inside resolveQbConnection() only: the credential read above it
  // also touches `integrations`, and comparing whole-file indices would make
  // this pass or fail on where a helper happens to be declared.
  const resolver = code(RESOLVER);
  const body = resolver.slice(
    resolver.indexOf('export async function resolveQbConnection'),
    resolver.indexOf('function isStale(')
  );
  assert.ok(body.length > 200, 'resolveQbConnection() not found — this assertion would pass vacuously');
  const firstConn = body.indexOf("from('qb_connections')");
  const firstLegacy = body.indexOf("from('integrations')");
  assert.ok(firstConn >= 0, `${RESOLVER} must read qb_connections`);
  assert.ok(firstLegacy >= 0, `${RESOLVER} must keep the legacy integrations fallback`);
  assert.ok(
    firstConn < firstLegacy,
    `${RESOLVER} must try qb_connections before the legacy integrations row`
  );
  ok('no site reads integrations without qb_connections; the resolver tries qb_connections first');
}

/* ══ 3. Credentials are trimmed ═══════════════════════════════════════════ */
{
  const resolver = code(RESOLVER);
  // The whole function, not the word "trim" somewhere in the file.
  assert.match(
    resolver,
    /function cred\(value: unknown\): string \| null \{[\s\S]{0,200}?value\.trim\(\)/,
    `${RESOLVER} lost the credential trim — a trailing space in a client secret fails OAuth as "bad credentials"`
  );
  // Every credential read goes through it, env vars included.
  for (const expr of [
    "cred(data?.qb_client_id)",
    "cred(process.env.QUICKBOOKS_CLIENT_ID)",
    "cred(data?.qb_client_secret)",
    "cred(process.env.QUICKBOOKS_CLIENT_SECRET)",
    "cred(data.qb_client_id)",
    "cred(data.qb_client_secret)",
  ]) {
    assert.ok(resolver.includes(expr), `${RESOLVER} must trim via ${expr}`);
  }
  assert.doesNotMatch(
    resolver,
    /Basic \$\{Buffer\.from\(`\$\{(?!conn\.clientId)/,
    `${RESOLVER} must build Basic auth from the trimmed credentials`
  );
  ok('every client id and secret, from the database or the environment, is trimmed');
}

/* ══ 4. Credit cards are in the accounts query ════════════════════════════ */
{
  const accounts = code('pages/api/qbo/accounts.ts');
  assert.match(
    accounts,
    /const SYNCED_TYPES = \['Bank', 'Credit Card'\] as const;/,
    'the accounts route must sync Bank AND Credit Card — hardcoding Bank is why credit cards were invisible'
  );
  assert.match(
    accounts,
    /SELECT \* FROM Account WHERE AccountType IN \(\$\{types\}\)/,
    'the accounts query must filter on both synced types, not one hardcoded AccountType'
  );
  assert.doesNotMatch(
    accounts,
    /AccountType = 'Bank'/,
    "the accounts route is back to AccountType = 'Bank' — credit cards have disappeared again"
  );
  // The UI must render both groups, each with name, last four, sub-type, balance.
  const switcher = code('components/AccountSwitcher.tsx');
  assert.match(
    switcher,
    /\{ key: 'Bank', label: 'Bank Accounts'[\s\S]{0,160}?\{ key: 'Credit Card', label: 'Credit Cards'/,
    'the account switcher must group into Bank Accounts and Credit Cards'
  );
  for (const field of ['acct.lastFour', 'acct.accountSubType', 'acct.currentBalance', 'acct.name']) {
    assert.ok(switcher.includes(field), `the account switcher row must show ${field}`);
  }
  ok('accounts sync both types; the switcher groups them and shows name, last four, sub-type and balance');
}

/* ══ 5. Figures stay tabular ══════════════════════════════════════════════ */
{
  const switcher = code('components/AccountSwitcher.tsx');
  // The balance cell specifically — `nums` appearing somewhere in the file is
  // the mutant that the last-four span would satisfy on its own.
  assert.match(
    switcher,
    /nums-money[^`]*\}`\}\s*>\s*\{formatBalance\(acct\.currentBalance\)\}/,
    'the account row balance lost its tabular figures — columns of money must line up'
  );
  assert.match(
    switcher,
    /nums-money[\s\S]{0,120}?\{formatBalance\(selected\.currentBalance\)\}/,
    'the trigger balance lost its tabular figures'
  );
  assert.match(
    switcher,
    /text-ink-soft nums"\s*>\s*\n?\s*···\{acct\.lastFour\}/,
    'the last four lost its tabular figures'
  );
  ok('every balance and last-four carries tabular figures');
}

/* ══ 6. The active company is server-side, and disconnect uses a modal ════ */
{
  const company = code('components/CompanySwitcher.tsx');
  const hook = code('hooks/useQBConnections.tsx');

  for (const [rel, src] of [['components/CompanySwitcher.tsx', company], ['hooks/useQBConnections.tsx', hook]] as const) {
    assert.doesNotMatch(
      src,
      /localStorage\.(?:set|get)Item/,
      `${rel} puts the active company in localStorage — the match routes and the extension read qb_connections.is_active, so the UI would show company B while the engine worked on company A`
    );
  }
  // The switch goes through the server route that owns is_active.
  assert.match(
    hook,
    /fetch\('\/api\/qb\/switch',\s*\{[\s\S]{0,200}?method: 'POST'/,
    'switching a company must POST /api/qb/switch, which moves qb_connections.is_active'
  );
  assert.match(
    readRepo('frontend/pages/api/qb/switch.ts').replace(/\/\*[\s\S]*?\*\//g, ''),
    /from\('qb_connections'\)\s*\.update\(\{ is_active: true \}\)/,
    '/api/qb/switch must write is_active'
  );

  // confirm() for a destructive action is the regression: it blocks the event
  // loop, cannot be styled, and reads as a browser warning on mobile.
  assert.doesNotMatch(
    company,
    /\bconfirm\s*\(/,
    'the company switcher is back to confirm() for disconnect — use DeleteConfirmModal'
  );
  assert.match(
    company,
    /<DeleteConfirmModal[\s\S]{0,400}?onConfirm=\{[\s\S]{0,200}?disconnect\(/,
    'disconnect must be confirmed through DeleteConfirmModal and only then call disconnect()'
  );
  ok('the active company stays server-side; disconnect is a real modal, not confirm()');
}

/* ══ 7. Both switchers are in the top bar, not the sidebar ════════════════ */
{
  const topbar = code('components/ShellTopBar.tsx');
  assert.match(topbar, /import\('@\/components\/CompanySwitcher'\)/, 'the top bar must mount the company switcher');
  assert.match(topbar, /import\('@\/components\/AccountSwitcher'\)/, 'the top bar must mount the account switcher');
  assert.match(topbar, /\bglass-chrome\b/, 'the top bar is the blurred chrome of the main column');

  const shell = code('app/(app)/layout.tsx');
  assert.match(shell, /<ShellTopBar \/>/, 'the shell must render the top bar');
  for (const gone of ['<CompanySwitcher', '<AccountSwitcher', 'SidebarCompanySwitcher']) {
    assert.ok(!shell.includes(gone), `${gone} is back in the sidebar — both switchers belong in the top bar`);
  }

  // Popovers inside a blurred bar must be opaque: never nest two blurs.
  for (const rel of ['components/CompanySwitcher.tsx', 'components/AccountSwitcher.tsx']) {
    const src = code(rel);
    assert.doesNotMatch(src, /backdrop-blur/, `${rel} must not blur inside the already-blurred top bar`);
    assert.doesNotMatch(src, /\bglass-card\b/, `${rel} must not use .glass-card (it blurs) in a list row`);
    assert.doesNotMatch(
      src,
      /variant="(?:secondary|ghost)"/,
      `${rel}: Button secondary IS .glass-card and ghost carries its own blur — neither belongs in a switcher row`
    );
    // 400px: a popover wider than the viewport is the failure mode here.
    assert.match(
      src,
      /max-w-\[calc\(100vw-2rem\)\]/,
      `${rel} popover has no viewport cap — it will overflow at 400px`
    );
  }
  ok('both switchers live in the glass-chrome top bar, with opaque popovers capped to the viewport');
}

/* ══ 8. Colour comes from tokens ══════════════════════════════════════════ */
{
  const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;
  const PALETTE = new RegExp(
    '\\b(?:bg|text|border|ring|from|to|via|divide|accent|placeholder|decoration|outline|shadow|fill|stroke)-' +
      '(?:slate|gray|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-' +
      '\\d{2,3}\\b',
    'g'
  );
  for (const rel of ['components/CompanySwitcher.tsx', 'components/AccountSwitcher.tsx', 'components/ShellTopBar.tsx']) {
    const src = read(rel);
    assert.equal(src.match(HEX), null, `${rel} has a literal hex — use a token from tailwind.config.js`);
    assert.equal(src.match(PALETTE), null, `${rel} uses a raw Tailwind palette class — use the semantic tokens`);
  }
  ok('the switchers and the top bar carry no literal hex and no raw palette class');
}

/* ══ 9. Migration 036 ═════════════════════════════════════════════════════ */
{
  const m = readRepo('supabase/migrations/036_qb_accounts.sql');
  assert.match(m, /CREATE TABLE IF NOT EXISTS public\.qb_accounts/, '036 must create qb_accounts');
  assert.match(m, /tenant_id\s+UUID NOT NULL REFERENCES public\.tenants\(id\)/, 'qb_accounts must be tenant-scoped');
  assert.match(m, /ALTER TABLE public\.qb_accounts ENABLE ROW LEVEL SECURITY/, 'qb_accounts must have RLS on');
  assert.match(
    m,
    /USING \(tenant_id = public\.user_tenant_id\(\)\)/,
    'the qb_accounts read policy must be tenant-isolated'
  );
  assert.match(
    m,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.qb_accounts FROM authenticated/,
    'a signed-in user must not be able to write a balance into the cache'
  );
  assert.match(
    m,
    /CHECK \(account_type IN \('Bank', 'Credit Card'\)\)/,
    "036's type domain must admit credit cards"
  );
  ok('036 adds a tenant-isolated, read-only-to-users qb_accounts cache');
}

/* ══ 10. BEHAVIOUR: drive the resolver ════════════════════════════════════ */

type Row = Record<string, any>;

/** The thinnest Supabase stand-in that answers the resolver's queries. */
function fakeDb(tables: Record<string, Row[]>, log: Row[] = []) {
  const builder = (table: string) => {
    const state: any = { table, op: 'select', filters: {} as Row, payload: null as Row | null };
    const api: any = {
      select: () => api,
      update: (payload: Row) => {
        state.op = 'update';
        state.payload = payload;
        return api;
      },
      eq: (col: string, val: any) => {
        state.filters[col] = val;
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: () => {
        const rows = (tables[table] || []).filter((r) =>
          Object.entries(state.filters).every(([k, v]) => r[k] === v)
        );
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      // An un-awaited update resolves when awaited, like PostgREST's builder.
      then: (resolve: any, reject: any) => {
        if (state.op === 'update') log.push({ table, payload: state.payload, filters: { ...state.filters } });
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return api;
  };
  return { from: builder, _writes: log };
}

async function behaviourChecks() {
  // Health writes are observed through the fake client rather than by stubbing
  // markQbConnection: the resolver hands qb-health a client, so a recorder
  // client sees the real writer's real UPDATE and the single-writer rule still
  // holds. tokenWrites/healthWrites split them by what the payload carries.
  const tokenWrites = (db: any) => db._writes.filter((w: Row) => 'access_token' in w.payload);
  const healthWrites = (db: any) => db._writes.filter((w: Row) => 'status' in w.payload);

  const realFetch = globalThis.fetch;
  const expired = new Date(Date.now() - 60_000).toISOString();
  const fresh = new Date(Date.now() + 3_600_000).toISOString();

  const conn = (over: Row = {}) => ({
    id: 'conn-1',
    tenant_id: 'tenant-1',
    realm_id: 'realm-1',
    company_name: 'Acme Books',
    access_token: 'stored-access',
    refresh_token: 'stored-refresh',
    token_expires_at: expired,
    is_active: true,
    ...over,
  });
  const creds = (over: Row = {}) => ({
    provider: 'quickbooks',
    tenant_id: 'tenant-1',
    // Trailing whitespace on BOTH, which is the bug this resolver fixes.
    qb_client_id: '  client-id \n',
    qb_client_secret: 'client-secret\t',
    ...over,
  });

  /* 10a. A successful refresh: trimmed Basic auth, both stores written,
          health CLEARED. */
  {
    let seen: any = null;
    globalThis.fetch = (async (_url: any, init: any) => {
      seen = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
        text: async () => '',
      };
    }) as any;

    const db = fakeDb({ qb_connections: [conn()], integrations: [creds()] });
    const result = await getQbToken(db as any, { tenantId: 'tenant-1', healthClient: db });

    assert.ok(result.ok, 'a healthy refresh must succeed');
    assert.equal(result.ok && result.accessToken, 'new-access');
    assert.equal(result.ok && result.refreshed, true);

    const basic = String(seen.headers.Authorization).replace('Basic ', '');
    assert.equal(
      Buffer.from(basic, 'base64').toString('utf8'),
      'client-id:client-secret',
      'the Basic auth header carried UNTRIMMED credentials — that fails OAuth as a bad-credential error'
    );
    assert.equal(String(seen.body), 'grant_type=refresh_token&refresh_token=stored-refresh');

    const tables = tokenWrites(db).map((w: Row) => w.table);
    assert.ok(
      tables.includes('qb_connections') && tables.includes('integrations'),
      `a refreshed token must land in BOTH stores; it only reached ${JSON.stringify(tables)}`
    );
    for (const w of tokenWrites(db)) {
      assert.equal(w.payload.access_token, 'new-access', `${w.table} did not receive the refreshed access token`);
      assert.equal(w.payload.refresh_token, 'new-refresh', `${w.table} did not receive the rotated refresh token`);
    }

    const cleared = healthWrites(db);
    assert.deepEqual(
      cleared.map((w: Row) => w.payload.status),
      ['connected'],
      'a successful refresh must CLEAR the status — otherwise one transient Intuit 500 flags a healthy firm forever'
    );
    assert.equal(cleared[0].table, 'qb_connections');
    assert.equal(cleared[0].filters.realm_id, 'realm-1');
    assert.equal(cleared[0].filters.tenant_id, 'tenant-1');
  }

  /* 10b. An unexpired token is returned untouched: no Intuit call at all. */
  {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error('unreachable');
    }) as any;

    const db = fakeDb({ qb_connections: [conn({ token_expires_at: fresh })], integrations: [creds()] });
    const result = await getQbToken(db as any, { tenantId: 'tenant-1', healthClient: db });

    assert.ok(result.ok);
    assert.equal(result.ok && result.accessToken, 'stored-access');
    assert.equal(result.ok && result.refreshed, false);
    assert.equal(called, false, 'a valid token must not spend an Intuit round trip');
    assert.deepEqual(db._writes, [], 'a no-op must write nothing at all');
  }

  /* 10c. Intuit rejects the grant: classified needs_reconnect, nothing stored. */
  {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
      json: async () => ({}),
    })) as any;

    const db = fakeDb({ qb_connections: [conn()], integrations: [creds()] });
    const result = await getQbToken(db as any, { tenantId: 'tenant-1', healthClient: db });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'refresh_failed');
    assert.equal(
      !result.ok && result.health,
      'needs_reconnect',
      'a dead refresh token must classify as needs_reconnect'
    );
    assert.deepEqual(healthWrites(db).map((w: Row) => w.payload.status), ['needs_reconnect']);
    assert.deepEqual(tokenWrites(db), [], 'a failed refresh must not write a token');
  }

  /* 10d. Intuit 500: transient, so 'error' and NOT an emailable status. */
  {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 500,
      text: async () => 'upstream exploded',
      json: async () => ({}),
    })) as any;

    const db = fakeDb({ qb_connections: [conn()], integrations: [creds()] });
    const result = await getQbToken(db as any, { tenantId: 'tenant-1', healthClient: db });
    assert.equal(!result.ok && result.health, 'error');
    assert.deepEqual(healthWrites(db).map((w: Row) => w.payload.status), ['error']);
    assert.equal(
      warrantsReconnectEmail('error'),
      false,
      'an Intuit outage must never email a firm "reconnect QuickBooks"'
    );
  }

  /* 10e. Missing credentials are OUR fault: 'unknown', never needs_reconnect. */
  {
    const envId = process.env.QUICKBOOKS_CLIENT_ID;
    const envSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
    delete process.env.QUICKBOOKS_CLIENT_ID;
    delete process.env.QUICKBOOKS_CLIENT_SECRET;

    const db = fakeDb({
      qb_connections: [conn()],
      integrations: [creds({ qb_client_id: null, qb_client_secret: null })],
    });
    const result = await getQbToken(db as any, { tenantId: 'tenant-1', healthClient: db });

    assert.equal(!result.ok && result.reason, 'missing_credentials');
    assert.equal(!result.ok && result.health, 'unknown');
    assert.deepEqual(healthWrites(db).map((w: Row) => w.payload.status), ['unknown']);
    assert.equal(
      warrantsReconnectEmail('unknown'),
      false,
      'our own missing credentials must never email a firm "reconnect QuickBooks"'
    );

    if (envId !== undefined) process.env.QUICKBOOKS_CLIENT_ID = envId;
    if (envSecret !== undefined) process.env.QUICKBOOKS_CLIENT_SECRET = envSecret;
  }

  /* 10f. No qb_connections row: falls back to the legacy integrations row,
          but a PINNED realm must not silently land on the wrong company. */
  {
    globalThis.fetch = (async () => {
      throw new Error('should not refresh');
    }) as any;

    const legacy = {
      provider: 'quickbooks',
      tenant_id: 'tenant-1',
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      realm_id: 'realm-legacy',
      expires_at: fresh,
      qb_client_id: 'id',
      qb_client_secret: 'secret',
    };

    const fallback = await getQbToken(fakeDb({ qb_connections: [], integrations: [legacy] }) as any, {
      tenantId: 'tenant-1',
    });
    assert.ok(fallback.ok, 'the legacy single-company row must still work');
    assert.equal(fallback.ok && fallback.connection.source, 'integrations');
    assert.equal(fallback.ok && fallback.connection.realmId, 'realm-legacy');

    const pinned = await getQbToken(fakeDb({ qb_connections: [], integrations: [legacy] }) as any, {
      tenantId: 'tenant-1',
      realmId: 'realm-1',
    });
    assert.equal(
      pinned.ok,
      false,
      'a caller that pinned a realm must NOT be handed the legacy row for a different company'
    );
    assert.equal(!pinned.ok && pinned.reason, 'not_connected');
  }

  globalThis.fetch = realFetch;
  ok('resolver behaviour: trimmed auth, both stores synced, status cleared on success and classified on failure');
}

// tsx compiles this to CJS, so no top-level await: the behavioural half runs
// from here. It MUST be invoked — an async function that is merely declared
// is a whole suite that passes vacuously, which is how this was caught.
behaviourChecks().then(
  () => console.log('\nall QB token + switcher checks passed'),
  (err) => {
    console.error(err?.message || err);
    process.exit(1);
  }
);
