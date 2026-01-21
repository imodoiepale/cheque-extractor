export const processingConfig = {
    // File constraints
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    supportedFormats: (process.env.SUPPORTED_FORMATS || 'pdf,png,jpg,jpeg').split(','),

    // Image processing
    maxImageWidth: 3000,
    maxImageHeight: 3000,

    // Check dimensions
    minCheckWidth: 500,
    minCheckHeight: 200,
    minAspectRatio: 2.0,
    maxAspectRatio: 3.5,

    // Confidence thresholds
    autoApproveThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD_AUTO || '0.90'),
    reviewThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD_REVIEW || '0.70'),

    // Processing timeouts
    preprocessingTimeout: 30000, // 30 seconds
    ocrTimeout: 60000, // 1 minute
    aiTimeout: 60000, // 1 minute
    totalTimeout: 180000, // 3 minutes
};