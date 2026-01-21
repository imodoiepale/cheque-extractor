import logger from '../../utils/logger';

interface HandwritingAnalysis {
    isHandwritten: boolean;
    confidence: number;
    legibility: 'clear' | 'moderate' | 'poor';
    suggestedApproach: 'standard' | 'enhanced' | 'manual_review';
}

export function analyzeHandwriting(text: string, confidence: number): HandwritingAnalysis {
    try {
        // Indicators of handwriting:
        // 1. Lower confidence scores (< 0.7)
        // 2. Irregular spacing
        // 3. Mixed case letters
        // 4. Common handwriting OCR errors

        const isHandwritten = detectHandwriting(text, confidence);
        const legibility = assessLegibility(text, confidence);
        const suggestedApproach = determineBestApproach(isHandwritten, legibility, confidence);

        logger.debug({ isHandwritten, legibility, suggestedApproach }, 'Handwriting analyzed');

        return {
            isHandwritten,
            confidence,
            legibility,
            suggestedApproach,
        };
    } catch (error) {
        logger.error({ error }, 'Handwriting analysis failed');
        return {
            isHandwritten: false,
            confidence: 0.5,
            legibility: 'moderate',
            suggestedApproach: 'standard',
        };
    }
}

function detectHandwriting(text: string, confidence: number): boolean {
    // Low confidence is a strong indicator
    if (confidence < 0.65) {
        return true;
    }

    // Check for common handwriting patterns
    const handwritingIndicators = [
        /[a-z][A-Z]/, // Mixed case in word
        /\s{2,}/, // Irregular spacing
        /[Il1]/, // Common OCR confusion in handwriting
        /[O0]/, // Common OCR confusion
    ];

    const indicatorCount = handwritingIndicators.filter(pattern => pattern.test(text)).length;

    return indicatorCount >= 2;
}

function assessLegibility(text: string, confidence: number): 'clear' | 'moderate' | 'poor' {
    if (confidence > 0.8) return 'clear';
    if (confidence > 0.6) return 'moderate';
    return 'poor';
}

function determineBestApproach(
    isHandwritten: boolean,
    legibility: HandwritingAnalysis['legibility'],
    confidence: number
): HandwritingAnalysis['suggestedApproach'] {
    if (!isHandwritten || legibility === 'clear') {
        return 'standard';
    }

    if (legibility === 'poor' || confidence < 0.5) {
        return 'manual_review';
    }

    return 'enhanced';
}

export function enhanceHandwrittenText(text: string): string {
    try {
        let enhanced = text;

        // Common handwriting OCR corrections
        const corrections: Record<string, string> = {
            // Number confusions
            'O': '0',
            'l': '1',
            'Z': '2',
            'S': '5',

            // Letter confusions
            '0': 'O', // Context-dependent
            '1': 'I', // Context-dependent
        };

        // Apply corrections cautiously
        // This is simplified - production would use context-aware corrections

        logger.debug({ original: text, enhanced }, 'Handwriting enhancement applied');

        return enhanced;
    } catch (error) {
        logger.error({ error }, 'Handwriting enhancement failed');
        return text;
    }
}

export function suggestManualFields(
    fields: Record<string, any>,
    handwritingAnalysis: HandwritingAnalysis
): string[] {
    const fieldsNeedingReview: string[] = [];

    if (handwritingAnalysis.suggestedApproach === 'manual_review') {
        // Flag all fields for review
        return Object.keys(fields);
    }

    // Flag individual fields with low confidence
    Object.entries(fields).forEach(([key, field]) => {
        if (field?.confidence && field.confidence < 0.65) {
            fieldsNeedingReview.push(key);
        }
    });

    return fieldsNeedingReview;
}

export function applyHandwritingBoost(confidence: number, isHandwritten: boolean): number {
    if (!isHandwritten) return confidence;

    // For handwritten text, AI typically performs better than OCR
    // Apply a small boost to AI-extracted handwritten fields
    const boosted = confidence * 1.15;

    return Math.min(1.0, boosted);
}