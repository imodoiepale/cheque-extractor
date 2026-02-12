import type { NextApiRequest, NextApiResponse } from 'next'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { id, format, bank_account, expense_account } = req.query

    try {
        // Forward query params to Python backend
        const params = new URLSearchParams()
        if (format) params.set('format', String(format))
        if (bank_account) params.set('bank_account', String(bank_account))
        if (expense_account) params.set('expense_account', String(expense_account))
        const qs = params.toString() ? `?${params.toString()}` : ''

        const response = await fetch(`${PYTHON_API}/api/jobs/${id}/export${qs}`)

        if (!response.ok) {
            const data = await response.json().catch(() => ({ error: 'Export failed' }))
            return res.status(response.status).json(data)
        }

        const body = await response.text()
        const contentType = response.headers.get('content-type') || 'text/csv'
        const disposition = response.headers.get('content-disposition') || `attachment; filename="checks_export.csv"`

        res.setHeader('Content-Type', contentType)
        res.setHeader('Content-Disposition', disposition)
        return res.status(200).send(body)
    } catch (error) {
        console.error('Export proxy error:', error)
        return res.status(500).json({ error: 'Failed to connect to processing server' })
    }
}
