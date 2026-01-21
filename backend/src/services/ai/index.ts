export * from './visionClient';
export * from './nerExtractor';

import { analyzeImageWithVision } from './visionClient';
import { extractFieldsFromVision } from './nerExtractor';
import { CheckFields } from '../../types/extraction';

export async function extractWithAI(imageBuffer: Buffer): Promise<Partial<CheckFields>> {
    const visionResponse = await analyzeImageWithVision(imageBuffer);
    const fullText = visionResponse.responses[0]?.fullTextAnnotation?.text || '';
    const fields = extractFieldsFromVision(fullText);
    return fields;
}