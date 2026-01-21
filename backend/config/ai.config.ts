export const aiConfig = {
    visionApiKey: process.env.VISION_API_KEY!,
    visionProjectId: process.env.VISION_API_PROJECT_ID,

    // Confidence thresholds
    minConfidence: 0.65,
    goodConfidence: 0.90,

    // Features to use
    features: [
        'DOCUMENT_TEXT_DETECTION',
        'TEXT_DETECTION',
    ],

    // Rate limiting
    maxRequestsPerMinute: 60,
};