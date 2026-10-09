/**
 * Render every Kyriq email (all Resend templates + the five Supabase auth
 * emails) with sample data, and send each to one inbox through Resend.
 *
 *   npx tsx scripts/send-test-emails.ts --to you@example.com
 *   npx tsx scripts/send-test-emails.ts --to you@example.com --from "Kyriq <onboarding@resend.dev>"
 *   npx tsx scripts/send-test-emails.ts --preview      # write HTML to ./email-previews, send nothing
 *
 * Needs RESEND_API_KEY in the environment (or frontend/.env.local). The default
 * sender is notifications@updates.kyriq.com, which only works once that domain
 * is verified in Resend; until then pass --from with resend.dev, which Resend
 * only delivers to the account owner's own address.
 *
 * Sends directly to Resend's API on purpose: lib/email/send.ts logs to the
 * database and checks unsubscribe preferences, which a test blast must not touch.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_KEYS, renderTemplate, SENDER, REPLY_TO, appUrl, type TemplateKey } from '../lib/email/templates';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const preview = process.argv.includes('--preview');
const to = arg('to');
const from = arg('from') || SENDER;

function envKey(): string | undefined {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY.trim();
  const f = path.join(root, '.env.local');
  if (!existsSync(f)) return undefined;
  const m = readFileSync(f, 'utf8').match(/^RESEND_API_KEY=(.*)$/m);
  return m?.[1].trim().replace(/^"|"$/g, '') || undefined;
}

const now = new Date();
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();
const SAMPLE: Record<string, unknown> = {
  firmName: 'Northstar Bookkeeping', name: 'Jane', inviterName: 'Michael', role: 'member',
  documentName: 'Chase statement Aug 2026.pdf', jobId: 'demo', errorMessage: 'The PDF is password protected.',
  companyName: 'Harbor Supply LLC', realmName: 'Harbor Supply LLC',
  checkCount: 428, exactMatches: 391, needsAttention: 37, clearedCount: 391, clearedTotal: 284310.55, remaining: 37,
  approvedBy: 'Jane Smith', checksProcessed: 1260, openItems: 37, discrepancies: 12, duplicates: 4, cleared: 1189,
  companies: 6, usageUsed: 3120, usageAllowance: 4500, monthLabel: 'August 2026', exactMatchRate: 91,
  weekStart: days(-7), weekEnd: now.toISOString(), trialEndsAt: days(3), renewalDate: days(30), daysAhead: 30,
  used: 2250, allowance: 4500, limit: 250, checksUsed: 125, overageChecks: 312, overageUsd: 37.44, rate: 0.12,
  planLabel: 'Professional', amountUsd: 497, invoiceNumber: 'KYQ-0042', periodLabel: 'Sep 9 to Oct 8, 2026',
  invoiceUrl: appUrl('/billing'), nextAttempt: days(3), at: now.toISOString(), device: 'Chrome on Windows', location: 'Nairobi',
  acceptUrl: appUrl('/invite/demo'), inviteUrl: appUrl('/invite/demo'), roleLabel: 'Member', memberEmail: 'jane@northstar.example', expiresAt: days(7), removedBy: 'Michael', newRole: 'admin',
};

type Mail = { key: string; subject: string; html: string; text: string };
const mails: Mail[] = [];

for (const key of TEMPLATE_KEYS as TemplateKey[]) {
  try {
    const r = renderTemplate(key, SAMPLE, { unsubscribeUrl: appUrl('/settings?tab=notifications') });
    mails.push({ key, subject: r.subject, html: r.html, text: r.text });
  } catch (e) {
    console.error(`  skip ${key}: ${(e as Error).message}`);
  }
}

// Supabase auth emails: subjects come from config.toml, links point at the app.
const tplDir = path.resolve(root, '../supabase/templates');
const subjects = Object.fromEntries(
  [...readFileSync(path.resolve(root, '../supabase/config.toml'), 'utf8').matchAll(/\[auth\.email\.template\.(\w+)\]\s*\nsubject = "([^"]+)"/g)].map((m) => [m[1], m[2]])
);
for (const f of readdirSync(tplDir).filter((f) => f.endsWith('.html'))) {
  const key = f.replace('.html', '');
  const html = readFileSync(path.join(tplDir, f), 'utf8').replaceAll('{{ .ConfirmationURL }}', appUrl('/login'));
  mails.push({ key: `auth_${key}`, subject: subjects[key] ?? key, html, text: `${subjects[key] ?? key}\n\n${appUrl('/login')}` });
}

if (preview) {
  const out = path.join(root, 'email-previews');
  mkdirSync(out, { recursive: true });
  for (const m of mails) writeFileSync(path.join(out, `${m.key}.html`), m.html);
  console.log(`wrote ${mails.length} previews to ${out}`);
  process.exit(0);
}

async function main() {
const key = envKey();
if (!to) throw new Error('Pass --to <address> (or --preview).');
if (!key) throw new Error('RESEND_API_KEY is not set (env or frontend/.env.local).');

let ok = 0;
for (const m of mails) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], reply_to: REPLY_TO, subject: `[Kyriq test] ${m.subject}`, html: m.html, text: m.text }),
  });
  const body = await res.text();
  if (res.ok) ok++;
  console.log(`${res.ok ? 'sent' : 'FAIL'}  ${m.key.padEnd(28)} ${res.ok ? '' : body.slice(0, 160)}`);
  await new Promise((r) => setTimeout(r, 600)); // Resend's default limit is 2 requests/second
}
console.log(`\n${ok}/${mails.length} sent to ${to} from ${from}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
