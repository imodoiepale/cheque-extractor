import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthenticatedClient } from '@/lib/supabase/api'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Use authenticated Supabase client - enforces RLS and tenant isolation
        let supabase;
        try {
            supabase = createAuthenticatedClient(req)
        } catch (authError: any) {
            console.error('Auth error:', authError.message)
            return res.status(200).json({ jobs: [], total: 0 })
        }

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

        if (error) {
            console.error('Jobs query error:', error)
            // Return empty array instead of error for better UX
            return res.status(200).json({ jobs: [], total: 0 })
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

        return res.status(200).json({ jobs: transformedJobs })
    } catch (error: any) {
        console.error('Jobs list error:', error)
        return res.status(500).json({ error: error.message || 'Failed to fetch jobs' })
    }
}
