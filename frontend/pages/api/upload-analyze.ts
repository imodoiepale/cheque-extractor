import type { NextApiRequest, NextApiResponse } from 'next'
import { requireProcessingAllowed } from '@/lib/usage-gate'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'

export const config = {
    api: {
        bodyParser: false,
    },
}

/**
 * POST /api/upload-analyze?confirm_reupload=true
 *
 * Upload + cheque detection. Gated as well as extraction, so a firm past its
 * trial cannot queue work it will never be able to process. The bearer token is
 * forwarded so the backend can resolve the tenant and record the upload
 * fingerprint (migration 028) that backs the duplicate warning.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const gate = await requireProcessingAllowed(req, res)
    if (!gate) return

    try {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        }
        const body = Buffer.concat(chunks)

        const confirmReupload =
            req.query.confirm_reupload === 'true' || req.query.confirm_reupload === '1'

        const headers: Record<string, string> = {
            'content-type': req.headers['content-type'] || 'application/octet-stream',
        }
        if (gate.accessToken) headers.Authorization = `Bearer ${gate.accessToken}`

        const url = `${PYTHON_API}/api/upload-analyze?confirm_reupload=${confirmReupload}`
        const response = await fetch(url, { method: 'POST', headers, body })

        const data = await response.json()

        if (!response.ok) {
            return res.status(response.status).json(data)
        }

        return res.status(200).json(data)
    } catch (error) {
        console.error('Upload-analyze proxy error:', error)
        return res.status(503).json({ error: 'Document processing service is currently unavailable. Please try again in a moment.' })
    }
}
