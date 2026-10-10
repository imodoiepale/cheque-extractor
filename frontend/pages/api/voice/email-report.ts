import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@supabase/ssr';
import { emailShell } from '@/lib/email/layout';
import { SENDER, REPLY_TO } from '@/lib/email/templates';
import { isSuperAdmin } from '@/lib/super-admin';

/**
 * POST /api/voice/email-report {title, filename, pdfBase64, summary?}
 *
 * Emails a report PDF that the browser built (lib/voice/report-pdf.ts) to the
 * SIGNED-IN USER ONLY. The recipient is never taken from the request, so the
 * voice agent cannot be used to send firm data anywhere else. Sent straight to
 * Resend because lib/email/send.ts has no attachment support.
 */
export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

const MAX_PDF_BYTES = 4 * 1024 * 1024;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' })),
      setAll: () => {},
    },
  });
  const { data } = await supabase.auth.getUser();
  const to = data.user?.email;
  if (!to) return res.status(401).json({ error: 'Sign in to continue.' });
  if (!isSuperAdmin(data.user)) return res.status(403).json({ error: 'Administrators only during the beta.' });

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return res.status(503).json({ error: 'Email is not configured.' });

  const { title, filename, pdfBase64 } = req.body ?? {};
  if (typeof pdfBase64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(pdfBase64)) return res.status(400).json({ error: 'Missing PDF' });
  if ((pdfBase64.length * 3) / 4 > MAX_PDF_BYTES) return res.status(413).json({ error: 'Report too large to email' });
  const safeTitle = String(title || 'Kyriq report').slice(0, 120);
  const safeName = String(filename || 'kyriq-report.pdf').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100);

  const html = emailShell({
    heading: safeTitle,
    eyebrow: 'Report',
    preheader: `${safeTitle} is attached as a PDF.`,
    paragraphs: [`Here is the ${safeTitle.toLowerCase()} you asked Kyriq Voice for. It is attached as a PDF.`],
    cta: { label: 'Open Kyriq', url: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://kyriq.com').replace(/\/$/, '')}/voice` },
  });

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: SENDER,
      to: [to],
      reply_to: REPLY_TO,
      subject: safeTitle,
      html,
      text: `${safeTitle} is attached as a PDF.`,
      attachments: [{ filename: safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`, content: pdfBase64 }],
    }),
  });
  if (!r.ok) return res.status(502).json({ error: 'The email provider rejected the message.' });
  return res.status(200).json({ sent: true, to });
}
