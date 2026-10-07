# Kyriq build handover

For a fresh session picking up the Kyriq v2 build. Self-contained: you should not need to read the
conversation that produced it.

Read `docs/STATUS.md` first for the full picture. This file is the action list.

---

## What this project is

Kyriq extracts data from scanned cheque PDFs using OCR, then reconciles those cheques against
QuickBooks Online transactions. Next.js 16 frontend, Python FastAPI backend, Supabase Postgres, and a
Manifest V3 Chrome extension that clears matched transactions inside QuickBooks.

Client is Michael, reached through Ajay. Pilot firms are waiting to start.

---

## Where the work is

Branch `feat/v2-glass-redesign-trial-and-roles`, open as pull request #1 into `main`.
37 commits, 729 files. The frontend deploys clean on Vercel.

Start by pulling both `main` and the branch. `docs/STATUS.md` and `CHECKLIST.md` are on `main`.

---

## Do this first, before any code

**Apply migrations 026 through 036 to Supabase.** Eleven migrations have never been run. They carry
the trial clock and billing period, the usage ledger, upload fingerprints, complimentary grants,
roles and multi-factor authentication, an anon-read security fix, the batches table, Stripe billing,
email and QuickBooks health, history and retention, and the QuickBooks accounts table.

Until they are applied, the reconciliation stepper, billing, email, history, trials and the company
switchers are all written against tables that do not exist. Nothing can be tested before this.

**You do not need the Supabase CLI or any local credentials.** Two machines have now stalled on
exactly that, so the migrations are bundled ready to paste:

> Open the Supabase dashboard, go to the SQL editor, paste the whole of
> `supabase/APPLY_026_TO_036.sql`, and run it once.

That file contains all eleven migrations in order inside a single transaction. If any statement
fails, nothing is applied and you get the error, so a partial state is not possible. Every migration
is idempotent, so running it twice is harmless. It is generated from `supabase/migrations/`, which
remains the source of truth; do not hand-edit the bundle.

If you do have the CLI and credentials, applying them individually in numeric order is equally fine.

After applying, confirm with an anon-key request against each new table and assert it returns zero
rows. That is both the smoke test and the security check.

---

## Then the remaining code

In rough priority order. All of it sits on the branch above.

1. **The auto-approve threshold has no home in the interface.** The matching preferences panel was
   removed from Settings at the client's request, but the one control meant to survive was never
   placed. It belongs next to the Approve All button on the Review step, where it is actually used.

2. **Per-page checkboxes for bank statement pages.** Currently the user picks a contiguous page
   range. It should be checkboxes, defaulted to the pages where cheques were detected. The backend
   already returns a per-page `checks_on_page` count from the analyze endpoint.

3. **Trial meter in the app.** Show days remaining and checks remaining. The trial clock and usage
   ledger land with migrations 026 and 027.

4. **One trial per QuickBooks company.** Stops someone opening repeat free trials with new email
   addresses. Key off the QuickBooks realm id, plus verified email and a disposable-domain block.

5. **Verify the Chrome extension.** A commit claims it matches the app, but it has never been checked
   by hand and the checklist still shows five open items. Load it unpacked, open a QuickBooks register
   and a reconcile page, and watch the side panel. Treat as unverified until then.

---

## Verification, none of which has been run

- The Stripe acceptance list in `STRIPE-BILLING-REQUIREMENTS.md` section 14, in Test Mode.
- Role matrix as User, Administrator and Super Admin, tested by calling endpoints directly rather
  than by checking whether menu items are hidden.
- An anon-key request returning zero rows for every new table.
- Extension tested by hand on a QuickBooks sandbox.
- Responsive pass at 1440px and 400px.
- `cd frontend && npm run type-check && npm run lint && npm run build`.

---

## Not your job, leave these

These need account access the client or James holds:

- `REQUIRE_AUTH=true` on the Railway backend.
- Supabase custom SMTP through Resend, and the site URL correction.
- SPF, DKIM and DMARC on `updates.kyriq.com`.
- Stripe product and price IDs into environment variables, Test and Live separately.
- Google Workspace verification, and `kyriq.com` in Search Console for the Chrome listing.
- Confirming the Intuit app sits under the client's account with production keys.

Blocked on assets that never arrived: the logo files (brand colours Indigo `#6366f1` and Emerald
`#10b981` are already applied, the files themselves were never added) and the 15-question FAQ copy,
whose section exists on the website but is deliberately empty.

---

## House rules for this repo

Breaking these has caused shipped bugs here before.

- Every write carries `tenant_id`. If a write succeeds but does not persist, suspect row-level
  security first.
- Check table and column names against `supabase/migrations/` before writing any query.
- Every migration must be idempotent.
- QuickBooks OAuth credential resolution must stay identical in `auth.ts` and `callback.ts`, and
  every value trimmed.
- QuickBooks updates go out sparse, and empty 204 response bodies must be handled.
- Extension actions must never fan out to rows the user did not click.
- A 200 is not proof of success. Assert on the parsed shape.

Verify with `cd frontend && npm run type-check && npm run lint && npm run build`. There is no real
test suite. The backend runs with `uvicorn api_server:app --port 3090 --reload`.

---

## One piece of noise to ignore

Pull request #1 shows a failing check named "Vercel – cheque-extractor-backend". The Python backend
runs on Railway and has no Vercel configuration in the repo. That check comes from a stray Vercel
project pointed at this repository and should be deleted in the Vercel dashboard. It is not a code
problem. The frontend check passes.

---

## A note on the checklist

`CHECKLIST.md` understates progress. It reads 69 done against 74 open, but the last nine commits
landed after it was last updated, so sections 3, 4, 9 and 13 show as open while being built. It was
left unedited deliberately to avoid conflicting with active work on the branch. Reconcile it once you
are the only session working there.
