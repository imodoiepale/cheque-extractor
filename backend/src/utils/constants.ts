export const PROCESSING_STAGES = {
    INGESTION: { name: 'ingestion', order: 1 },
    PREPROCESSING: { name: 'preprocessing', order: 2 },
    SEGMENTATION: { name: 'segmentation', order: 3 },
    OCR_EXTRACTION: { name: 'ocr_extraction', order: 4 },
    AI_EXTRACTION: { name: 'ai_extraction', order: 5 },
    HYBRID_SELECTION: { name: 'hybrid_selection', order: 6 },
    VALIDATION: { name: 'validation', order: 7 },
    COMPLETE: { name: 'complete', order: 8 },
} as const;

export const CHECK_STATUS = {
    UPLOADED: 'uploaded',
    PROCESSING: 'processing',
    PROCESSED: 'processed',
    REVIEW_REQUIRED: 'review_required',
    REVIEW_SUGGESTED: 'review_suggested',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    EXPORTED: 'exported',
} as const;

export const CONFIDENCE_THRESHOLDS = {
    AUTO_APPROVE: parseFloat(process.env.CONFIDENCE_THRESHOLD_AUTO || '0.90'),
    REVIEW_SUGGESTED: parseFloat(process.env.CONFIDENCE_THRESHOLD_REVIEW || '0.70'),
};

export const MICR_PATTERNS = {
    ROUTING: /\d{9}/,
    ACCOUNT: /\d{4,17}/,
    SERIAL: /\d{4,10}/,
};

export const CHECK_DIMENSIONS = {
    MIN_WIDTH: 500,
    MIN_HEIGHT: 200,
    MIN_ASPECT_RATIO: 2.0,
    MAX_ASPECT_RATIO: 3.5,
};