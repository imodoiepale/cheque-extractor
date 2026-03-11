import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';

interface Job {
  job_id: string;
  pdf_name: string;
  status: string;
  total_pages: number;
  total_checks: number;
  checks: any[];
  created_at: string;
  completed_at?: string;
}

interface JobsStore {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  lastFetch: number;
  fetchJobs: (force?: boolean) => Promise<void>;
  clearJobs: () => void;
  updateJob: (jobId: string, updates: Partial<Job>) => void;
  deleteJob: (jobId: string) => void;
}

const CACHE_DURATION = 30000; // 30 seconds cache

export const useJobsStore = create<JobsStore>((set, get) => ({
  jobs: [],
  loading: false,
  error: null,
  lastFetch: 0,

  fetchJobs: async (force = false) => {
    const now = Date.now();
    const { lastFetch, loading } = get();

    // Skip if already loading
    if (loading) return;

    // Use cache if recent fetch (unless forced)
    if (!force && now - lastFetch < CACHE_DURATION) {
      console.log('📦 Using cached jobs data');
      return;
    }

    set({ loading: true, error: null });

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
      };

      const res = await fetch('/api/jobs?source=auto', { headers });
      
      if (!res.ok) {
        throw new Error('Failed to fetch jobs');
      }

      const data = await res.json();
      
      const jobs = data.jobs || [];
      
      // Log detailed job information
      console.log('✅ Jobs fetched and cached:', jobs.length);
      
      let totalChecks = 0;
      jobs.forEach((job: any) => {
        const checkCount = job.checks?.length || 0;
        totalChecks += checkCount;
        console.log(`  📄 ${job.pdf_name}: ${checkCount} checks (status: ${job.status})`);
      });
      
      console.log(`📊 Total checks across all jobs: ${totalChecks}`);
      
      set({ 
        jobs, 
        loading: false, 
        lastFetch: now,
        error: null 
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to fetch jobs';
      set({ error, loading: false });
      console.error('❌ Failed to fetch jobs:', error);
    }
  },

  clearJobs: () => {
    set({ jobs: [], lastFetch: 0 });
  },

  updateJob: (jobId: string, updates: Partial<Job>) => {
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.job_id === jobId ? { ...job, ...updates } : job
      ),
    }));
  },

  deleteJob: (jobId: string) => {
    set((state) => ({
      jobs: state.jobs.filter((job) => job.job_id !== jobId),
    }));
  },
}));
