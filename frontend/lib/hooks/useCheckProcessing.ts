'use client'

import { useState, useEffect, useCallback } from 'react'

export interface CheckResult {
    check_id: string
    page: number
    image_file: string
    width: number
    height: number
    extraction: any | null
}

export interface MethodProgress {
    method: string
    label: string
    status: 'pending' | 'running' | 'complete' | 'error'
    progress: number
    checks_processed: number
    checks_total: number
    error?: string
}

export interface JobData {
    job_id: string
    status: string
    pdf_name: string
    doc_format: string | null
    total_pages: number
    total_checks: number
    checks: CheckResult[]
    error: string | null
    created_at: string
    completed_at: string | null
    methods_progress?: MethodProgress[]
    selected_methods?: string[]
}

const STAGE_MAP: Record<string, string> = {
    pending: 'upload',
    analyzing: 'upload',
    detecting: 'segmentation',
    extracting: 'extraction',
    ocr_running: 'extraction',
    ai_running: 'extraction',
    hybrid_running: 'extraction',
    merging: 'merging',
    complete: 'complete',
    error: 'error',
}

const METHOD_LABELS: Record<string, string> = {
    ocr: 'OCR Engine',
    ai: 'AI / Gemini',
    hybrid: 'Hybrid (OCR + AI)',
}

export function useCheckProcessing(jobId: string, selectedMethods?: string[]) {
    const [stages] = useState<string[]>([
        'upload',
        'segmentation',
        'extraction',
        'merging',
        'complete',
    ])
    const [currentStage, setCurrentStage] = useState('upload')
    const [progress, setProgress] = useState(0)
    const [isComplete, setIsComplete] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [jobData, setJobData] = useState<JobData | null>(null)
    const [methodsProgress, setMethodsProgress] = useState<MethodProgress[]>([])

    // Initialize method progress from selected methods
    useEffect(() => {
        if (selectedMethods && selectedMethods.length > 0 && methodsProgress.length === 0) {
            const methods = selectedMethods.includes('hybrid')
                ? ['ocr', 'ai']
                : selectedMethods
            setMethodsProgress(
                methods.map((m) => ({
                    method: m,
                    label: METHOD_LABELS[m] || m,
                    status: 'pending' as const,
                    progress: 0,
                    checks_processed: 0,
                    checks_total: 0,
                }))
            )
        }
    }, [selectedMethods])

    const poll = useCallback(async () => {
        try {
            const res = await fetch(`/api/jobs/${jobId}`)
            if (!res.ok) {
                setError('Failed to fetch job status')
                return true // stop polling
            }
            const data = await res.json() as JobData
            setJobData(data)

            const mappedStage = STAGE_MAP[data.status] || data.status
            setCurrentStage(mappedStage)

            // Update per-method progress from backend if available
            if (data.methods_progress && data.methods_progress.length > 0) {
                setMethodsProgress(data.methods_progress.map((mp: any) => ({
                    method: mp.method,
                    label: METHOD_LABELS[mp.method] || mp.method,
                    status: mp.status || 'pending',
                    progress: mp.progress || 0,
                    checks_processed: mp.checks_processed || 0,
                    checks_total: mp.checks_total || data.total_checks || 0,
                    error: mp.error,
                })))
            } else {
                // Simulate per-method progress from overall status
                setMethodsProgress((prev) => {
                    if (prev.length === 0) return prev
                    return prev.map((mp) => {
                        if (data.status === 'detecting' || data.status === 'pending' || data.status === 'analyzing') {
                            return { ...mp, status: 'pending' as const, progress: 0 }
                        }
                        if (data.status === 'extracting' || data.status === 'ocr_running' || data.status === 'ai_running' || data.status === 'hybrid_running') {
                            const isOcrPhase = data.status === 'extracting' || data.status === 'ocr_running'
                            const isAiPhase = data.status === 'ai_running' || data.status === 'hybrid_running'
                            if (mp.method === 'ocr') {
                                return {
                                    ...mp,
                                    status: isOcrPhase ? 'running' as const : (isAiPhase ? 'complete' as const : 'pending' as const),
                                    progress: isOcrPhase ? 50 : (isAiPhase ? 100 : 0),
                                    checks_total: data.total_checks,
                                    checks_processed: isOcrPhase ? Math.floor(data.total_checks / 2) : (isAiPhase ? data.total_checks : 0),
                                }
                            }
                            if (mp.method === 'ai') {
                                return {
                                    ...mp,
                                    status: isAiPhase ? 'running' as const : 'pending' as const,
                                    progress: isAiPhase ? 50 : 0,
                                    checks_total: data.total_checks,
                                    checks_processed: isAiPhase ? Math.floor(data.total_checks / 2) : 0,
                                }
                            }
                            return { ...mp, status: 'running' as const, progress: 50, checks_total: data.total_checks }
                        }
                        if (data.status === 'merging') {
                            return { ...mp, status: 'complete' as const, progress: 100, checks_total: data.total_checks, checks_processed: data.total_checks }
                        }
                        if (data.status === 'complete') {
                            return { ...mp, status: 'complete' as const, progress: 100, checks_total: data.total_checks, checks_processed: data.total_checks }
                        }
                        if (data.status === 'error') {
                            return { ...mp, status: 'error' as const, error: data.error || 'Failed' }
                        }
                        return mp
                    })
                })
            }

            // Calculate overall progress
            if (data.status === 'pending' || data.status === 'analyzing') setProgress(5)
            else if (data.status === 'detecting') setProgress(20)
            else if (data.status === 'extracting' || data.status === 'ocr_running') setProgress(40)
            else if (data.status === 'ai_running' || data.status === 'hybrid_running') setProgress(60)
            else if (data.status === 'merging') setProgress(85)
            else if (data.status === 'complete') {
                setProgress(100)
                setIsComplete(true)
                return true // stop polling
            } else if (data.status === 'error') {
                setError(data.error || 'Processing failed')
                return true // stop polling
            }

            return false // continue polling
        } catch (err) {
            setError('Connection to server lost')
            return true // stop polling
        }
    }, [jobId])

    useEffect(() => {
        if (!jobId) return

        let stopped = false
        const interval = setInterval(async () => {
            if (stopped) return
            const done = await poll()
            if (done) {
                stopped = true
                clearInterval(interval)
            }
        }, 1500)

        // Initial poll
        poll()

        return () => {
            stopped = true
            clearInterval(interval)
        }
    }, [jobId, poll])

    return {
        stages,
        currentStage,
        progress,
        isComplete,
        error,
        jobData,
        methodsProgress,
    }
}