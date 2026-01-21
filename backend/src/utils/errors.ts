export class ProcessingError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500,
        public details?: any
    ) {
        super(message);
        this.name = 'ProcessingError';
    }
}

export class ValidationError extends Error {
    constructor(
        message: string,
        public field: string,
        public details?: any
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class OCRError extends ProcessingError {
    constructor(message: string, details?: any) {
        super(message, 'OCR_ERROR', 500, details);
        this.name = 'OCRError';
    }
}

export class AIError extends ProcessingError {
    constructor(message: string, details?: any) {
        super(message, 'AI_ERROR', 500, details);
        this.name = 'AIError';
    }
}

export class ExportError extends ProcessingError {
    constructor(message: string, details?: any) {
        super(message, 'EXPORT_ERROR', 500, details);
        this.name = 'ExportError';
    }
}