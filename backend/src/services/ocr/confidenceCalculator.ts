import Tesseract from 'tesseract.js';
import logger from '../../utils/logger';

export function calculateOCRConfidence(
    ocrResult: Tesseract.Page,
    extractedValue: string
): number {
    try {
        // Base confidence from Tesseract
        let confidence = ocrResult.confidence / 100; // Convert to 0-1 scale

        // Adjust based on text characteristics
        const adjustments = {
            textLength: calculateTextLengthFactor(extractedValue),
            specialChars: calculateSpecialCharFactor(extractedValue),
            wordConfidence: calculateWordConfidence(ocrResult, extractedValue),
        };

        // Apply adjustments
        confidence *= adjustments.textLength;
        confidence *= adjustments.specialChars;
        confidence = (confidence + adjustments.wordConfidence) / 2;

        // Clamp to [0, 1]
        const finalConfidence = Math.max(0, Math.min(1, confidence));

        logger.debug({
            baseConfidence: ocrResult.confidence,
            adjustments,
            finalConfidence
        }, 'OCR confidence calculated');

        return finalConfidence;
    } catch (error) {
        logger.error({ error }, 'Failed to calculate OCR confidence');
        return 0.5;
    }
}

function calculateTextLengthFactor(text: string): number {
    const length = text.trim().length;

    // Very short text is less reliable
    if (length < 3) return 0.7;
    if (length < 5) return 0.85;

    // Optimal length
    if (length >= 5 && length <= 50) return 1.0;

    // Very long text might have errors
    if (length > 100) return 0.9;

    return 0.95;
}

function calculateSpecialCharFactor(text: string): number {
    // Count special characters that might indicate OCR errors
    const suspiciousChars = /[~`^°¬¦§±µ¶]/g;
    const matches = text.match(suspiciousChars);

    if (!matches) return 1.0;

    // Reduce confidence for each suspicious character
    const reduction = matches.length * 0.1;
    return Math.max(0.5, 1.0 - reduction);
}

function calculateWordConfidence(
    ocrResult: Tesseract.Page,
    extractedValue: string
): number {
    try {
        // Find words in the OCR result that match extracted value
        const words = ocrResult.words || [];
        const targetWords = extractedValue.toLowerCase().split(/\s+/);

        if (targetWords.length === 0) return 0.5;

        const wordConfidences: number[] = [];

        for (const targetWord of targetWords) {
            const matchingWord = words.find(w =>
                w.text.toLowerCase().includes(targetWord) ||
                targetWord.includes(w.text.toLowerCase())
            );

            if (matchingWord) {
                wordConfidences.push(matchingWord.confidence / 100);
            }
        }

        if (wordConfidences.length === 0) return 0.5;

        // Average word confidence
        const avg = wordConfidences.reduce((sum, conf) => sum + conf, 0) / wordConfidences.length;
        return avg;

    } catch (error) {
        return 0.5;
    }
}

export function adjustOCRConfidenceByRegion(
    baseConfidence: number,
    region: 'micr' | 'amount' | 'date' | 'payee' | 'other'
): number {
    // Different regions have different typical accuracy
    const regionFactors = {
        micr: 0.95,    // MICR is very consistent
        amount: 0.90,  // Numbers are usually clear
        date: 0.90,    // Dates are structured
        payee: 0.85,   // Names can vary
        other: 1.0,
    };

    return baseConfidence * regionFactors[region];
}

export function combineConfidences(confidences: number[]): number {
    if (confidences.length === 0) return 0;

    // Use weighted average, giving more weight to higher confidences
    const sorted = [...confidences].sort((a, b) => b - a);

    const weights = sorted.map((_, i) => 1 / (i + 1));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    const weighted = sorted.reduce((sum, conf, i) => sum + conf * weights[i], 0);

    return weighted / totalWeight;
}