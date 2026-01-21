export interface FieldExtraction {
    value: any;
    confidence: number;
    source: 'ocr' | 'ai' | 'hybrid' | 'manual';
    rawText?: string;
    boundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export interface CheckFields {
    payee: FieldExtraction;
    amount: FieldExtraction;
    amountWritten?: FieldExtraction;
    checkDate: FieldExtraction;
    checkNumber: FieldExtraction;
    bankName: FieldExtraction;
    micr?: {
        routing: FieldExtraction;
        account: FieldExtraction;
        serial: FieldExtraction;
        raw?: string;
    };
    memo?: FieldExtraction;
}

export interface ExtractionResult {
    fields: CheckFields;
    confidenceSummary: number;
    extractionMethod: 'ocr' | 'ai' | 'hybrid';
    rawOcrResults?: any;
    rawAiResults?: any;
    processingTimeMs: number;
}

export interface ValidationError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
    code: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    confidenceSummary: number;
    recommendedStatus: 'approved' | 'review_suggested' | 'review_required';
}