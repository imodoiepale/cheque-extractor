import type { NextApiRequest, NextApiResponse } from 'next'
import { backendAuthHeaders } from '@/lib/backend-auth'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const auth = await backendAuthHeaders(req, res)
    if (!auth) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const pathParts = req.query.path as string[]
    if (!pathParts || pathParts.length < 2) {
        return res.status(400).json({ error: 'Invalid path. Use /api/check-image/{job_id}/{check_id}' })
    }

    const [jobId, checkId] = pathParts

    try {
        const response = await fetch(`${PYTHON_API}/api/checks/${jobId}/${checkId}/image`, { headers: auth })

        if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer())
            res.setHeader('Content-Type', 'image/png')
            res.setHeader('Cache-Control', 'public, max-age=86400')
            return res.status(200).send(buffer)
        }
    } catch {
        // Python backend unavailable — fall through to Supabase Storage
    }

    // Fallback: redirect to Supabase Storage public URL
    if (SUPABASE_URL) {
        const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/checks/jobs/${jobId}/images/${checkId}.png`
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.redirect(307, storageUrl)
        return
    }

    res.status(404).json({ error: 'Image not found' })
}
