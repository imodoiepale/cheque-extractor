import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthenticatedClient } from '@/lib/supabase/api'

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const source = req.query.source as string || 'db'
        
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
                
                const response = await fetch(`${PYTHON_API}/api/jobs?${params.toString()}`)
                if (response.ok) {
                    const data = await response.json()
                    console.log('✅ [/api/jobs] Fetched from Python backend:', data.jobs?.length || 0, 'jobs')
                    return res.status(200).json(data)
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

        // Get user info for debugging
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
            console.error('❌ Failed to get user:', userError)
            return res.status(200).json({ jobs: [], total: 0 })
        }

        // Get user's tenant_id
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('tenant_id, email')
            .eq('id', user.id)
            .single()

        console.log('🔍 [/api/jobs] User:', {
            user_id: user.id,
            email: user.email,
            tenant_id: profile?.tenant_id,
        })

        // Query check_jobs with RLS filtering by tenant_id
        const limit = req.query.limit ? parseInt(String(req.query.limit)) : 100
        const offset = req.query.offset ? parseInt(String(req.query.offset)) : 0
        
        let query = supabase
            .from('check_jobs')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (req.query.status) {
            query = query.eq('status', String(req.query.status))
        }

        const { data: jobs, error } = await query

        console.log('📊 [/api/jobs] Query result:', {
            user_id: user.id,
            tenant_id: profile?.tenant_id,
            jobs_count: jobs?.length || 0,
            has_error: !!error,
            job_ids: jobs?.map(j => j.job_id).slice(0, 5) || [],
        })

        if (error) {
            console.error('❌ Jobs query error:', error)
            // Return empty array instead of error for better UX
            return res.status(200).json({ jobs: [], total: 0 })
        }

        // Log tenant_id for each job to verify RLS
        if (jobs && jobs.length > 0) {
            console.log('📋 [/api/jobs] Job tenant_ids:', jobs.map(j => ({
                job_id: j.job_id,
                tenant_id: j.tenant_id,
                pdf_name: j.pdf_name,
            })))
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
                total_pages: job.total_pages,
                total_checks: job.total_checks,
                checks: checks,
                error: job.error_message,
                created_at: job.created_at,
                completed_at: job.completed_at,
            };
        })

        console.log('✅ [/api/jobs] Returning', transformedJobs.length, 'jobs to user', user.email)

        return res.status(200).json({ jobs: transformedJobs })
    } catch (error: any) {
        console.error('Jobs list error:', error)
        return res.status(500).json({ error: error.message || 'Failed to fetch jobs' })
    }
}
