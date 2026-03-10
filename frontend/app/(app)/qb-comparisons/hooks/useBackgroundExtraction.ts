import { useEffect, useRef } from 'react';

/**
 * Background extraction hook
 * Silently extracts jobs that are stuck at 'analyzed' status
 */
export function useBackgroundExtraction() {
  const processingRef = useRef(new Set<string>());
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Only run once per session
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const extractIncompleteJobs = async () => {
      try {
        console.log('🔍 Checking for incomplete jobs...');
        
        // Fetch all jobs
        const response = await fetch('/api/jobs?source=auto');
        if (!response.ok) return;
        
        const data = await response.json();
        const jobs = data.jobs || [];
        
        // Find jobs that are analyzed but not complete
        const incompleteJobs = jobs.filter((job: any) => 
          job.status === 'analyzed' && 
          job.total_checks > 0 &&
          !processingRef.current.has(job.job_id)
        );
        
        if (incompleteJobs.length === 0) {
          console.log('✅ No incomplete jobs found');
          return;
        }
        
        console.log(`🔄 Found ${incompleteJobs.length} incomplete jobs, starting background extraction...`);
        
        // Extract each job silently in the background
        for (const job of incompleteJobs) {
          processingRef.current.add(job.job_id);
          
          // Don't await - let it run in background
          extractJob(job).catch(err => {
            console.error(`❌ Background extraction failed for ${job.job_id}:`, err);
          }).finally(() => {
            processingRef.current.delete(job.job_id);
          });
        }
      } catch (error) {
        console.error('❌ Background extraction check failed:', error);
      }
    };

    const extractJob = async (job: any) => {
      console.log(`⚙️ Extracting ${job.job_id} (${job.total_checks} checks)...`);
      
      const response = await fetch('/api/start-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.job_id,
          methods: ['hybrid'],
          page_range: { from: 1, to: job.total_pages || 999 },
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Extraction failed: ${response.status}`);
      }
      
      console.log(`✅ Extraction started for ${job.job_id}`);
    };

    // Run after a short delay to avoid blocking initial page load
    const timer = setTimeout(extractIncompleteJobs, 2000);
    
    return () => clearTimeout(timer);
  }, []);
}
