export interface ProcessingStage {
    name: string;
    order: number;
    status: 'pending' | 'processing' | 'complete' | 'error' | 'skipped';
    progress: number;
    data?: any;
    startedAt?: Date;
    completedAt?: Date;
    durationMs?: number;
    errorMessage?: string;
}

export interface ProcessingContext {
    checkId: string;
    tenantId: string;
    fileUrl: string;
    fileType: string;
    currentStage: string;
    stages: Map<string, ProcessingStage>;
}

export interface ImageProcessingResult {
    originalImage: Buffer;
    processedImage: Buffer;
    beforeUrl?: string;
    afterUrl?: string;
    transformations: string[];
}

export interface CheckSegment {
    index: number;
    bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    image: Buffer;
    aspectRatio: number;
    area: number;
}