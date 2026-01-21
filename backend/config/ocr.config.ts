export const ocrConfig = {
    language: process.env.OCR_LANGUAGE || 'eng',
    psm: 3, // Page segmentation mode: Fully automatic page segmentation
    oem: 3, // OCR Engine mode: Default

    // Confidence thresholds
    minConfidence: 0.60,
    goodConfidence: 0.85,

    // MICR specific
    micrLanguage: 'eng',
    micrPsm: 7, // Single text line
};