import type { NextApiRequest, NextApiResponse } from 'next'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const pathParts = req.query.path as string[]
    if (!pathParts || pathParts.length < 1) {
        return res.status(400).json({ error: 'Invalid path. Use /api/pdf-file/{job_id}' })
    }

    const [jobId] = pathParts

    try {
        const response = await fetch(`${PYTHON_API}/api/jobs/${jobId}/pdf`)

        if (!response.ok) {
            return res.status(response.status).json({ error: 'PDF not found' })
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', 'inline')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        return res.status(200).send(buffer)
    } catch (error) {
        console.error('PDF proxy error:', error)
        return res.status(500).json({ error: 'Failed to fetch PDF' })
    }
}
