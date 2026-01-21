export interface ProcessingStageModel {
    id: string;
    check_id: string;
    stage_name: string;
    stage_order: number;
    status: 'pending' | 'processing' | 'complete' | 'error' | 'skipped';
    progress: number;
    stage_data?: any;
    error_message?: string;
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
    created_at: string;
    updated_at: string;
}