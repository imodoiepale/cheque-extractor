import type { NextApiRequest, NextApiResponse } from 'next'
import { backendAuthHeaders } from '@/lib/backend-auth'
import { createAuthenticatedClient } from '@/lib/supabase/api'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'
const SUMMARY_COLUMNS = 'job_id,status,pdf_name,total_pages,total_checks,created_at,completed_at,doc_kind,error_message'

// The Python backend's job list has no company; attach check_jobs.realm_id so
// pages can show only the active company's uploads.
async function withRealms(req: NextApiRequest, jobs: any[]) {
    const ids = jobs.map(j => j.job_id).filter(Boolean)
    if (!ids.length) return jobs
    const { data, error } = await createAuthenticatedClient(req)
        .from('check_jobs').select('job_id,realm_id').in('job_id', ids)
    if (error) throw new Error('Failed to read upload companies')
    const realm = Object.fromEntries((data || []).map((r: any) => [r.job_id, r.realm_id]))
    return jobs.map(j => ({ ...j, realm_id: realm[j.job_id] ?? null }))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const auth = await backendAuthHeaders(req, res)
    if (!auth) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // ?fields=summary: list views that never render cheques skip the heavy
        // checks_data column (and the Python backend, which always returns it).
        const summary = req.query.fields === 'summary'
        const source = summary ? 'db' : (req.query.source as string || 'db')
        
        // If source=auto, fetch from Python backend which merges DB + memory
        if (source === 'auto' || source === 'memory') {
            try {
                const limit = req.query.limit ? parseInt(String(req.query.limit)) : 100
                const offset = req.query.offset ? parseInt(String(req.query.offset)) : 0
                const status = req.query.status as string || undefined
                
                const params = new URLSearchParams({
                    source,
                    limit: String(limit),
                    offset: String(offset),
                })
                if (status) params.set('status', status)
                
                const response = await fetch(`${PYTHON_API}/api/jobs?${params.toString()}`, { headers: auth })
                if (response.ok) {
                    const data = await response.json()
                    return res.status(200).json({ ...data, jobs: await withRealms(req, data.jobs || []) })
                }
                console.warn('⚠️ Python backend unavailable, falling back to DB')
            } catch (backendError) {
                console.warn('⚠️ Python backend error, falling back to DB:', backendError)
            }
        }

        // Fallback to DB-only query
        // Use authenticated Supabase client - enforces RLS and tenant isolation
        let supabase;
        try {
            supabase = createAuthenticatedClient(req)
        } catch (authError: any) {
            console.error('❌ Auth error:', authError.message)
            return res.status(200).json({ jobs: [], total: 0 })
        }

        // RLS on check_jobs scopes this to the caller's tenant; no extra
        // getUser()/profile round trips needed.
        const limit = req.query.limit ? parseInt(String(req.query.limit)) : 100
        const offset = req.query.offset ? parseInt(String(req.query.offset)) : 0

        const run = (columns: string) => {
            let query = supabase
                .from('check_jobs')
                .select(columns)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1)
            if (req.query.status) query = query.eq('status', String(req.query.status))
            return query
        }

        let { data, error } = await run(summary ? SUMMARY_COLUMNS : '*')
        // A database without migration 044 has no doc_kind column: degrade, don't blank the list.
        if (error && summary) ({ data, error } = await run(SUMMARY_COLUMNS.replace(',doc_kind', '')))
        const jobs = (data || []) as any[]

        if (error) {
            console.error('Jobs query error:', error)
            // Return empty array instead of error for better UX
            return res.status(200).json({ jobs: [], total: 0 })
        }

        if (summary) {
            return res.status(200).json({
                jobs: jobs.map(({ error_message, ...j }) => ({ ...j, doc_kind: j.doc_kind ?? null, error: error_message })),
            })
        }
        // Transform to match expected format
        const transformedJobs = (jobs || []).map(job => {
            // Parse checks_data if it's a JSON string
            let checks = [];
            if (job.checks_data) {
                try {
                    checks = typeof job.checks_data === 'string' 
                        ? JSON.parse(job.checks_data) 
                        : job.checks_data;
                } catch (e) {
                    console.error('Failed to parse checks_data for job', job.job_id, e);
                    checks = [];
                }
            }

            return {
                job_id: job.job_id,
                status: job.status,
                pdf_name: job.pdf_name,
                pdf_url: job.pdf_url,
                file_size: job.file_size,
                doc_format: job.doc_format,
                doc_kind: job.doc_kind ?? null,
                page_kinds: job.page_kinds ?? null,
                total_pages: job.total_pages,
                total_checks: job.total_checks,
                checks: checks,
                error: job.error_message,
                created_at: job.created_at,
                completed_at: job.completed_at,
                realm_id: job.realm_id ?? null,
            };
        })

        return res.status(200).json({ jobs: transformedJobs })
    } catch (error: any) {
        console.error('Jobs list error:', error)
        return res.status(500).json({ error: error.message || 'Failed to fetch jobs' })
    }
}
