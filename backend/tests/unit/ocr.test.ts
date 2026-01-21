import { performOCR } from '../../src/services/ocr/tesseractEngine';
import { extractFieldsFromOCR } from '../../src/services/ocr/fieldExtractor';
import { parseMICRLine } from '../../src/services/ocr/micrParser';
import fs from 'fs';
import path from 'path';

describe('OCR Services', () => {
    let testImageBuffer: Buffer;

    beforeAll(() => {
        const imagePath = path.join(__dirname, '../fixtures/sample-checks/check1.png');
        testImageBuffer = fs.readFileSync(imagePath);
    });

    test('should perform OCR on image', async () => {
        const result = await performOCR(testImageBuffer);

        expect(result.text).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
    }, 30000); // 30 second timeout for OCR

    test('should extract fields from OCR data', async () => {
        const ocrData = await performOCR(testImageBuffer);
        const fields = extractFieldsFromOCR(ocrData);

        expect(fields.payee).toBeDefined();
        expect(fields.amount).toBeDefined();
        expect(fields.checkDate).toBeDefined();
    }, 30000);

    test('should parse MICR line', () => {
        const micrText = '⑆021000021⑆ ⑈123456789⑈ 10452⑆';
        const result = parseMICRLine(micrText);

        expect(result).toBeDefined();
        expect(result?.routing.value).toBe('021000021');
    });
});