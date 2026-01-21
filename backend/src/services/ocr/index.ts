export * from './tesseractEngine';
export * from './micrParser';
export * from './fieldExtractor';

import { performOCR } from './tesseractEngine';
import { extractFieldsFromOCR } from './fieldExtractor';
import { CheckFields } from '../../types/extraction';

export async function extractWithOCR(imageBuffer: Buffer): Promise<Partial<CheckFields>> {
    const ocrData = await performOCR(imageBuffer);
    const fields = extractFieldsFromOCR(ocrData);
    return fields;
}