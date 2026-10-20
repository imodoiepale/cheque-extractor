import type { NextApiRequest, NextApiResponse } from 'next'
import { jobAccessHeaders } from '@/lib/backend-auth'
import { createClient } from '@supabase/supabase-js'
import { notifyAdmins } from '@/lib/email/send'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

function getServiceClient() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const auth = await jobAccessHeaders(req, res, String(req.query.id ?? ''))
    if (!auth) return

    const { id } = req.query

    if (req.method === 'GET') {
        // Try Python backend first
        try {
            const response = await fetch(`${PYTHON_API}/api/jobs/${id}`, { headers: auth })
            if (response.ok) {
                const data = await response.json()
                if (data?.status === 'complete') await extractionEmail(String(id))
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
            if (job.status === 'complete') await extractionEmail(String(id))
            let checks = []
            if (job.checks_data) {
                try { checks = typeof job.checks_data === 'string' ? JSON.parse(job.checks_data) : job.checks_data } catch {}
            }
            return res.status(200).json({
                job_id: job.job_id,
                status: job.status,
                pdf_name: job.pdf_name,
                doc_format: job.doc_format,
                doc_kind: job.doc_kind ?? null,
                page_kinds: job.page_kinds ?? null,
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

/**
 * "Your checks are ready" — sent the first time a poll observes completion.
 * The Python backend owns the status change; this route is where the frontend
 * first sees it. sendOnce keyed on job_id makes every later poll a no-op
 * (one failed insert per admin). Jobs completed more than a day ago are
 * skipped so reopening an old job never mails about it.
 * ponytail: a job nobody polls never gets this email; upgrade path is a pass
 * in /api/email/notices over recently completed check_jobs.
 */
async function extractionEmail(jobId: string) {
    try {
        const supabase = getServiceClient()
        if (!supabase) return
        const { data: job } = await supabase
            .from('check_jobs')
            .select('job_id, tenant_id, pdf_name, total_checks, batch_id, completed_at')
            .eq('job_id', jobId)
            .maybeSingle()
        if (!job?.tenant_id) return
        if (job.completed_at && Date.now() - new Date(job.completed_at).getTime() > 86400_000) return

        let exactMatches: number | undefined
        let needsAttention: number | undefined
        if (job.batch_id) {
            const { data: matches } = await supabase
                .from('matches')
                .select('confidence_score')
                .eq('tenant_id', job.tenant_id)
                .eq('batch_id', job.batch_id)
            if (matches?.length) {
                exactMatches = matches.filter((m: any) => Number(m.confidence_score) >= 95).length
                needsAttention = matches.length - exactMatches
            }
        }

        await notifyAdmins({
            tenantId: job.tenant_id,
            kind: 'extraction_complete',
            periodKey: job.job_id,
            template: 'extraction_complete',
            firmNameFrom: 'tenants',
            vars: {
                jobId: job.job_id,
                documentName: job.pdf_name,
                checkCount: job.total_checks ?? 0,
                exactMatches,
                needsAttention,
            },
            metadata: { job_id: job.job_id },
        })
    } catch (err: any) {
        console.error('[jobs] extraction email failed:', err?.message || err)
    }
}
