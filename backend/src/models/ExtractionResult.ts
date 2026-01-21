import { CheckFields } from '../types/extraction';

export interface ExtractionResult {
    checkId: string;
    fields: CheckFields;
    confidenceSummary: number;
    ocrResults: any;
    aiResults: any;
    processingTimeMs: number;
    extractedAt: Date;
}