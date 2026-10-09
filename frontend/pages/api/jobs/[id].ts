import type { NextApiRequest, NextApiResponse } from 'next'
import { backendAuthHeaders } from '@/lib/backend-auth'
import { createClient } from '@supabase/supabase-js'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

function getServiceClient() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const auth = await backendAuthHeaders(req, res)
    if (!auth) return

    const { id } = req.query

    if (req.method === 'GET') {
        // Try Python backend first
        try {
            const response = await fetch(`${PYTHON_API}/api/jobs/${id}`, { headers: auth })
            if (response.ok) {
                const data = await response.json()
                return res.status(200).json(data)
            }
        } catch {
            // Backend unavailable — fall through to Supabase DB
        }

        // Fallback: read from Supabase check_jobs table
        try {
            const supabase = getServiceClient()
            if (!supabase) return res.status(503).json({ error: 'Service unavailable' })
            const { data: job, error } = await supabase
                .from('check_jobs')
                .select('*')
                .eq('job_id', id)
                .single()
            if (error || !job) return res.status(404).json({ error: 'Job not found' })
            let checks = []
            if (job.checks_data) {
                try { checks = typeof job.checks_data === 'string' ? JSON.parse(job.checks_data) : job.checks_data } catch {}
            }
            return res.status(200).json({
                job_id: job.job_id,
                status: job.status,
                pdf_name: job.pdf_name,
                doc_format: job.doc_format,
                total_pages: job.total_pages,
                total_checks: job.total_checks,
                checks,
                error: job.error_message,
                created_at: job.created_at,
                completed_at: job.completed_at,
                pdf_url: job.pdf_url,
            })
        } catch (dbError) {
            console.error('Job GET DB fallback error:', dbError)
            return res.status(500).json({ error: 'Failed to retrieve job' })
        }
    }

    if (req.method === 'DELETE') {
        // Try Python backend first
        try {
            const response = await fetch(`${PYTHON_API}/api/jobs/${id}`, { method: 'DELETE', headers: auth })
            if (response.ok) {
                const data = await response.json()
                return res.status(200).json(data)
            }
        } catch {
            // Backend unavailable — fall through to Supabase DB delete
        }

        // Fallback: delete directly from Supabase
        try {
            const supabase = getServiceClient()
            if (!supabase) return res.status(503).json({ error: 'Service unavailable' })
            const { error } = await supabase
                .from('check_jobs')
                .delete()
                .eq('job_id', id)
            if (error) return res.status(500).json({ error: 'Failed to delete job', details: error.message })
            return res.status(200).json({ success: true, job_id: id })
        } catch (dbError) {
            console.error('Job DELETE DB fallback error:', dbError)
            return res.status(500).json({ error: 'Failed to delete job' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
