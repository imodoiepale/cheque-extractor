import type { NextApiRequest, NextApiResponse } from 'next'
import { backendAuthHeaders } from '@/lib/backend-auth'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'

export const config = {
    api: {
        bodyParser: false, // We forward the raw multipart body
    },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const auth = await backendAuthHeaders(req, res)
    if (!auth) return

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Collect raw body
        const chunks: Buffer[] = []
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        }
        const body = Buffer.concat(chunks)

        // Forward to Python API with same content-type (multipart)
        const response = await fetch(`${PYTHON_API}/api/upload-pdf`, {
            method: 'POST',
            headers: { ...auth,
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
        console.error('Upload proxy error:', error)
        return res.status(503).json({ error: 'Document processing service is currently unavailable. Please try again in a moment.' })
    }
}
