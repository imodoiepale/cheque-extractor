import logger from '../../utils/logger';

interface AIConfidenceFactors {
    textDetectionConfidence: number;
    boundingBoxQuality: number;
    textLength: number;
    languageDetected: boolean;
}

export function calculateAIConfidence(factors: AIConfidenceFactors): number {
    try {
        // Weight different factors
        const weights = {
            textDetection: 0.5,
            boundingBox: 0.2,
            textLength: 0.15,
            language: 0.15,
        };

        // Normalize text length factor (longer text = higher confidence up to a point)
        const textLengthScore = Math.min(factors.textLength / 50, 1.0);

        // Calculate weighted confidence
        const confidence = (
            factors.textDetectionConfidence * weights.textDetection +
            factors.boundingBoxQuality * weights.boundingBox +
            textLengthScore * weights.textLength +
            (factors.languageDetected ? 1.0 : 0.5) * weights.language
        );

        // Clamp to [0, 1]
        const finalConfidence = Math.max(0, Math.min(1, confidence));

        logger.debug({ factors, confidence: finalConfidence }, 'AI confidence calculated');

        return finalConfidence;
    } catch (error) {
        logger.error({ error }, 'Failed to calculate AI confidence');
        return 0.5; // Default moderate confidence
    }
}

export function adjustConfidenceByContext(
    baseConfidence: number,
    context: {
        hasMultipleDetections?: boolean;
        matchesExpectedFormat?: boolean;
        crossValidated?: boolean;
    }
): number {
    let adjusted = baseConfidence;

    // Boost confidence if multiple detection methods agree
    if (context.hasMultipleDetections) {
        adjusted += 0.05;
    }

    // Boost if matches expected format (date, amount, etc.)
    if (context.matchesExpectedFormat) {
        adjusted += 0.08;
    }

    // Boost if cross-validated with other fields
    if (context.crossValidated) {
        adjusted += 0.07;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, adjusted));
}

export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 0.85) return 'high';
    if (confidence >= 0.65) return 'medium';
    return 'low';
}