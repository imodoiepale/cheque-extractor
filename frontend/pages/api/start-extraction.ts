import type { NextApiRequest, NextApiResponse } from 'next'
import { requireProcessingAllowed } from '@/lib/usage-gate'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'

/**
 * POST /api/start-extraction
 *
 * Extraction is the billable act, so this is where the trial gate lives. Every
 * caller in the app goes through this proxy (dashboard, process page, upload
 * page, the background-extraction hook), so an expired trial is stopped here
 * even though the UI button may still be visible.
 *
 * The bearer token is forwarded to the Python backend so it can resolve the
 * tenant, stamp check_jobs.tenant_id and write the usage ledger against the
 * right firm. It used to be dropped, which is why jobs had no owner.
 *
 * `confirmReupload` is the user opting in after being warned the file was
 * uploaded before; the backend answers with { duplicate: true,
 * previous_uploaded_at, ... } until it is set.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const gate = await requireProcessingAllowed(req, res)
    if (!gate) return

    try {
        const { job_id, methods, page_range, cheque_range, force, batch_id } = req.body
        const confirmReupload = Boolean(
            req.body?.confirm_reupload ?? req.body?.confirmReupload
        )

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (gate.accessToken) headers.Authorization = `Bearer ${gate.accessToken}`

        const response = await fetch(`${PYTHON_API}/api/start-extraction`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                job_id,
                methods,
                page_range,
                cheque_range,
                force: !!force,
                confirm_reupload: confirmReupload,
                // Late attach: only used when upload-analyze ran before the
                // batch existed. The backend validates it against the tenant.
                batch_id: typeof batch_id === 'string' ? batch_id : null,
            }),
        })

        const data = await response.json()

        if (!response.ok) {
            return res.status(response.status).json(data)
        }

        return res.status(200).json(data)
    } catch (error) {
        console.error('Start extraction proxy error:', error)
        return res.status(503).json({ error: 'Extraction service is currently unavailable. Please try again in a moment.' })
    }
}
