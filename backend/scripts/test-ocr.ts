import fs from 'fs';
import path from 'path';
import { performOCR } from '../src/services/ocr/tesseractEngine';
import { extractFieldsFromOCR } from '../src/services/ocr/fieldExtractor';
import logger from '../src/utils/logger';

async function testOCR() {
    try {
        const testImagePath = process.argv[2] || path.join(__dirname, '../tests/fixtures/sample-checks/check1.png');

        if (!fs.existsSync(testImagePath)) {
            throw new Error(`Test image not found: ${testImagePath}`);
        }

        logger.info({ testImagePath }, 'Testing OCR with image');

        const imageBuffer = fs.readFileSync(testImagePath);

        // Run OCR
        const ocrData = await performOCR(imageBuffer);

        logger.info({ confidence: ocrData.confidence }, 'OCR completed');
        logger.info({ text: ocrData.text.substring(0, 200) }, 'Extracted text preview');

        // Extract fields
        const fields = extractFieldsFromOCR(ocrData);

        logger.info({ fields }, 'Extracted fields');

        console.log('\n=== OCR Test Results ===');
        console.log('Payee:', fields.payee?.value, `(${fields.payee?.confidence})`);
        console.log('Amount:', fields.amount?.value, `(${fields.amount?.confidence})`);
        console.log('Date:', fields.checkDate?.value, `(${fields.checkDate?.confidence})`);
        console.log('Check #:', fields.checkNumber?.value, `(${fields.checkNumber?.confidence})`);
        console.log('Bank:', fields.bankName?.value, `(${fields.bankName?.confidence})`);

    } catch (error) {
        logger.error({ error }, 'OCR test failed');
        process.exit(1);
    }
}

testOCR();