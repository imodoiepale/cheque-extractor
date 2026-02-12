import type { NextApiRequest, NextApiResponse } from 'next'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { id } = req.query

    try {
        const response = await fetch(`${PYTHON_API}/api/jobs/${id}`)
        const data = await response.json()

        if (!response.ok) {
            return res.status(response.status).json(data)
        }

        return res.status(200).json(data)
    } catch (error) {
        console.error('Job status proxy error:', error)
        return res.status(500).json({ error: 'Failed to connect to processing server' })
    }
}
