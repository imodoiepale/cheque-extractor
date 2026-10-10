import type { NextApiRequest, NextApiResponse } from 'next'
import { jobAccessHeaders } from '@/lib/backend-auth'
import { createClient } from '@supabase/supabase-js'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const auth = await jobAccessHeaders(req, res, String((req.query.path as string[] | undefined)?.[0] ?? ''))
    if (!auth) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const pathParts = req.query.path as string[]
    if (!pathParts || pathParts.length < 1) {
        return res.status(400).json({ error: 'Invalid path. Use /api/pdf-file/{job_id}' })
    }

    const [jobId] = pathParts

    // Try Python backend first
    try {
        const response = await fetch(`${PYTHON_API}/api/jobs/${jobId}/pdf`, { headers: auth })
        if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer())
            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader('Content-Disposition', 'inline')
            res.setHeader('Cache-Control', 'public, max-age=86400')
            return res.status(200).send(buffer)
        }
    } catch {
        // Python backend unavailable — fall through to Supabase Storage
    }

    // Fallback: look up pdf_name from DB, then redirect to Supabase Storage
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            const { data: job } = await supabase
                .from('check_jobs')
                .select('pdf_name, pdf_url')
                .eq('job_id', jobId)
                .single()
            if (job?.pdf_url) {
                return res.redirect(307, job.pdf_url)
            }
            if (job?.pdf_name) {
                const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/checks/jobs/${jobId}/${encodeURIComponent(job.pdf_name)}`
                return res.redirect(307, storageUrl)
            }
        } catch (dbError) {
            console.error('PDF DB fallback error:', dbError)
        }
    }

    return res.status(404).json({ error: 'PDF not found' })
}
