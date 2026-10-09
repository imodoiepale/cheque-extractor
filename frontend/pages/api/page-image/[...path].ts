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
        return res.status(400).json({ error: 'Invalid path. Use /api/page-image/{job_id}/{page_number}' })
    }

    const [jobId, pageNum] = pathParts

    try {
        const response = await fetch(`${PYTHON_API}/api/jobs/${jobId}/pages/${pageNum}/image`, { headers: auth })

        if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer())
            const contentType = response.headers.get('content-type') || 'image/png'
            res.setHeader('Content-Type', contentType)
            res.setHeader('Cache-Control', 'public, max-age=86400')
            return res.status(200).send(buffer)
        }
    } catch {
        // Python backend unavailable — fall through to Supabase Storage
    }

    // Fallback: redirect to Supabase Storage public URL
    // Backend stores page images as page_{N}.png (1-indexed)
    if (SUPABASE_URL) {
        const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/checks/jobs/${jobId}/pages/page_${pageNum}.png`
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.redirect(307, storageUrl)
        return
    }

    res.status(404).json({ error: 'Page image not found' })
}
