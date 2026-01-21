import fs from 'fs';
import path from 'path';
import { analyzeImageWithVision } from '../src/services/ai/visionClient';
import { extractFieldsFromVision } from '../src/services/ai/nerExtractor';
import logger from '../src/utils/logger';

async function testAI() {
    try {
        const testImagePath = process.argv[2] || path.join(__dirname, '../tests/fixtures/sample-checks/check1.png');

        if (!fs.existsSync(testImagePath)) {
            throw new Error(`Test image not found: ${testImagePath}`);
        }

        logger.info({ testImagePath }, 'Testing AI with image');

        const imageBuffer = fs.readFileSync(testImagePath);

        // Run Vision API
        const visionResponse = await analyzeImageWithVision(imageBuffer);

        const fullText = visionResponse.responses[0]?.fullTextAnnotation?.text || '';

        logger.info({ textLength: fullText.length }, 'Vision API completed');
        logger.info({ text: fullText.substring(0, 200) }, 'Extracted text preview');

        // Extract fields
        const fields = extractFieldsFromVision(fullText);

        logger.info({ fields }, 'Extracted fields');

        console.log('\n=== AI Test Results ===');
        console.log('Payee:', fields.payee?.value, `(${fields.payee?.confidence})`);
        console.log('Amount:', fields.amount?.value, `(${fields.amount?.confidence})`);
        console.log('Date:', fields.checkDate?.value, `(${fields.checkDate?.confidence})`);
        console.log('Check #:', fields.checkNumber?.value, `(${fields.checkNumber?.confidence})`);
        console.log('Bank:', fields.bankName?.value, `(${fields.bankName?.confidence})`);

    } catch (error) {
        logger.error({ error }, 'AI test failed');
        process.exit(1);
    }
}

testAI();