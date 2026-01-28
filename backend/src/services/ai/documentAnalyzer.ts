import { analyzeImageWithVision } from './visionClient';
import { crossValidateFields } from './contextAnalyzer';
import logger from '../../utils/logger';

interface DocumentStructure {
    totalTextBlocks: number;
    hasMultipleColumns: boolean;
    hasTables: boolean;
    documentType: 'check' | 'invoice' | 'receipt' | 'unknown';
    orientation: 'portrait' | 'landscape';
    quality: 'high' | 'medium' | 'low';
}

export async function analyzeDocumentStructure(
    imageBuffer: Buffer
): Promise<DocumentStructure> {
    try {
        logger.info('Analyzing document structure');

        const visionResponse = await analyzeImageWithVision(imageBuffer);
        const textAnnotations = visionResponse.responses[0]?.textAnnotations || [];

        // Analyze layout
        const totalTextBlocks = textAnnotations.length;

        // Detect document type based on text patterns
        const fullText = visionResponse.responses[0]?.fullTextAnnotation?.text || '';
        const documentType = detectDocumentType(fullText);

        // Detect orientation based on text block positions
        const orientation = detectOrientation(textAnnotations);

        // Assess quality based on confidence scores
        const avgConfidence = textAnnotations.length > 0
            ? textAnnotations.reduce((sum, block: any) => sum + (block.confidence || 0.8), 0) / textAnnotations.length
            : 0.5;

        const quality = avgConfidence > 0.8 ? 'high' : avgConfidence > 0.6 ? 'medium' : 'low';

        const structure: DocumentStructure = {
            totalTextBlocks,
            hasMultipleColumns: false, // Simplified - would need more complex analysis
            hasTables: false, // Simplified
            documentType,
            orientation,
            quality,
        };

        logger.info({ structure }, 'Document structure analyzed');

        return structure;
    } catch (error) {
        logger.error({ error }, 'Document structure analysis failed');
        return {
            totalTextBlocks: 0,
            hasMultipleColumns: false,
            hasTables: false,
            documentType: 'unknown',
            orientation: 'landscape',
            quality: 'low',
        };
    }
}

function detectDocumentType(text: string): DocumentStructure['documentType'] {
    const lowerText = text.toLowerCase();

    // Check-specific keywords
    if (lowerText.includes('pay to the order of') ||
        lowerText.includes('dollars') ||
        /\d{9}.*\d{4,17}/.test(text)) { // MICR pattern
        return 'check';
    }

    // Invoice-specific keywords
    if (lowerText.includes('invoice') ||
        lowerText.includes('bill to') ||
        lowerText.includes('total due')) {
        return 'invoice';
    }

    // Receipt-specific keywords
    if (lowerText.includes('receipt') ||
        lowerText.includes('thank you') ||
        lowerText.includes('total')) {
        return 'receipt';
    }

    return 'unknown';
}

function detectOrientation(textAnnotations: any[]): 'portrait' | 'landscape' {
    if (textAnnotations.length === 0) return 'landscape'; // Default for checks

    // Calculate bounding box of all text
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;

    textAnnotations.forEach((annotation: any) => {
        if (annotation.boundingPoly?.vertices) {
            annotation.boundingPoly.vertices.forEach((vertex: any) => {
                minX = Math.min(minX, vertex.x || 0);
                minY = Math.min(minY, vertex.y || 0);
                maxX = Math.max(maxX, vertex.x || 0);
                maxY = Math.max(maxY, vertex.y || 0);
            });
        }
    });

    const width = maxX - minX;
    const height = maxY - minY;

    return width > height ? 'landscape' : 'portrait';
}

export function enhanceExtractionWithContext(
    rawExtraction: any,
    documentStructure: DocumentStructure
): any {
    // Adjust confidence based on document quality
    if (documentStructure.quality === 'low') {
        // Reduce all confidence scores by 15%
        Object.keys(rawExtraction).forEach(key => {
            if (rawExtraction[key]?.confidence) {
                rawExtraction[key].confidence *= 0.85;
            }
        });
    } else if (documentStructure.quality === 'high') {
        // Boost confidence by 10%
        Object.keys(rawExtraction).forEach(key => {
            if (rawExtraction[key]?.confidence) {
                rawExtraction[key].confidence = Math.min(1.0, rawExtraction[key].confidence * 1.1);
            }
        });
    }

    // Cross-validate fields
    const validation = crossValidateFields(rawExtraction);

    if (!validation.valid) {
        logger.warn({ issues: validation.issues }, 'Cross-validation issues detected');
    }

    return {
        ...rawExtraction,
        documentQuality: documentStructure.quality,
        validationIssues: validation.issues,
    };
}