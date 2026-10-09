/**
 * The one Kyriq email shell. Every Resend email (renderTemplate) and every
 * Supabase auth email (scripts/build-auth-emails.ts) is drawn by this, so the
 * brand is a one-file change.
 *
 * Email-client rules this follows: tables for layout, inline styles only, PNG
 * logo (Gmail and Outlook do not render SVG), a solid fallback colour under
 * every gradient (Outlook drops gradients), and a hidden preheader.
 */

const SITE = (process.env.NEXT_PUBLIC_APP_URL || 'https://kyriq.com').replace(/\/$/, '');

// Exactly the logo pack's palette (Font Name & Color Codes.txt): Indigo
// #6366f1, Emerald #10b981, Black #000000, White #ffffff. Greys are black at
// an opacity, tints are indigo at an opacity, so nothing off-brand appears.
const C = {
  canvas: '#f3f3fe',              // indigo at ~5% on white
  card: '#ffffff',
  cardBorder: 'rgba(99,102,241,0.18)',
  text: '#000000',
  body: '#474747',              // black at 72% on white (Outlook ignores rgba text)
  muted: '#737373',
  faint: '#999999',
  indigo: '#6366f1',
  indigoDeep: '#6366f1',
  emerald: '#10b981',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface ShellOptions {
  /** Title in the card. Already-escaped HTML is NOT accepted; pass text. */
  heading: string;
  /** Inbox preview line. */
  preheader?: string;
  /** Plain-text paragraphs, escaped here. */
  paragraphs?: string[];
  /** Raw HTML injected after the paragraphs (trusted callers only, e.g. auth templates). */
  rawHtml?: string;
  cta?: { label: string; url: string };
  footnote?: string;
  /** Present for notification mail; absent means "concerns your account". */
  unsubscribeUrl?: string | null;
  /** Eyebrow above the heading, e.g. "Billing" or "Security". */
  eyebrow?: string;
  /** When true the CTA url is emitted verbatim (Supabase {{ .ConfirmationURL }} placeholders). */
  rawUrls?: boolean;
}

export function emailShell(o: ShellOptions): string {
  const url = (u: string) => (o.rawUrls ? u : escapeHtml(u));
  const paragraphs = (o.paragraphs ?? [])
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${C.body};">${escapeHtml(p)}</p>`)
    .join('\n');

  const cta = o.cta
    ? `<tr><td style="padding:10px 0 4px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="border-radius:999px;background:${C.indigo};background-image:linear-gradient(135deg,${C.indigo} 0%,${C.indigoDeep} 100%);box-shadow:0 8px 24px rgba(99,102,241,0.32);">
      <a href="${url(o.cta.url)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;letter-spacing:0.1px;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(o.cta.label)}&nbsp;&rarr;</a>
    </td>
  </tr></table>
  <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${C.faint};">Button not working? Paste this link into your browser:<br>
  <a href="${url(o.cta.url)}" style="color:${C.muted};word-break:break-all;">${url(o.cta.url)}</a></p>
</td></tr>`
    : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(o.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(o.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas};background-image:radial-gradient(ellipse 80% 50% at 50% -10%,rgba(99,102,241,0.16),rgba(244,245,255,0) 70%);">
<tr><td align="center" style="padding:44px 16px 36px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

    <tr><td align="left" style="padding:0 4px 26px;">
      <a href="${SITE}" style="text-decoration:none;"><img src="${SITE}/brand/kyriq-logo.png" width="104" height="43" alt="Kyriq" style="display:block;border:0;outline:none;"></a>
    </td></tr>

    <tr><td style="background:${C.card};border:1px solid ${C.cardBorder};border-radius:22px;overflow:hidden;box-shadow:0 18px 48px rgba(99,102,241,0.12);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.indigo};background-image:linear-gradient(90deg,${C.indigo} 0%,${C.emerald} 100%);">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 28px;">
          ${o.eyebrow ? `<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#10b981;">${escapeHtml(o.eyebrow)}</p>` : ''}
          <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.4px;color:${C.text};">${escapeHtml(o.heading)}</h1>
          ${paragraphs}
          ${o.rawHtml ?? ''}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cta}</table>
          ${o.footnote ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid rgba(99,102,241,0.12);font-size:13px;line-height:1.55;color:${C.muted};">${escapeHtml(o.footnote)}</p>` : ''}
        </td></tr>
      </table>
    </td></tr>

    <tr><td align="center" style="padding:26px 12px 0;">
      <p style="margin:0;font-size:12px;line-height:1.7;color:${C.muted};">Questions? Reply to this email or write to <a href="mailto:support@kyriq.com" style="color:#6366f1;text-decoration:none;">support@kyriq.com</a></p>
      <p style="margin:6px 0 0;font-size:11px;line-height:1.7;color:${C.faint};">
        Kyriq &middot; Check reconciliation for QuickBooks Online &middot;
        <a href="${SITE}/privacy" style="color:${C.faint};text-decoration:underline;">Privacy</a>
        ${o.unsubscribeUrl ? ` &middot; <a href="${url(o.unsubscribeUrl)}" style="color:${C.faint};text-decoration:underline;">Stop these updates</a>` : '<br>You are receiving this because it concerns your Kyriq account.'}
      </p>
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
}
