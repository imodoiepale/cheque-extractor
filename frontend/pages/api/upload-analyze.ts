import type { NextApiRequest, NextApiResponse } from 'next'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'

export const config = {
    api: {
        bodyParser: false,
    },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        }
        const body = Buffer.concat(chunks)

        // Forward to Python API - upload-analyze endpoint (upload + detect cheques, no extraction)
        const response = await fetch(`${PYTHON_API}/api/upload-analyze`, {
            method: 'POST',
            headers: {
                'content-type': req.headers['content-type'] || 'application/octet-stream',
            },
            body,
        })

        const data = await response.json()

        if (!response.ok) {
            return res.status(response.status).json(data)
        }

        return res.status(200).json(data)
    } catch (error) {
        console.error('Upload-analyze proxy error:', error)
        // Fallback: use the regular upload endpoint and simulate analyze response
        return res.status(500).json({ error: 'Failed to connect to processing server' })
    }
}
