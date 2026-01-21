import fs from 'fs';
import path from 'path';
import { ProcessingOrchestrator } from '../src/services/orchestration';
import { createCheckRecord } from '../src/services/ingestion/checkCreator';
import logger from '../src/utils/logger';

async function benchmark() {
    try {
        const testImagePath = process.argv[2] || path.join(__dirname, '../tests/fixtures/sample-checks/check1.png');

        if (!fs.existsSync(testImagePath)) {
            throw new Error(`Test image not found: ${testImagePath}`);
        }

        logger.info({ testImagePath }, 'Running benchmark');

        // Create test check record
        const check = await createCheckRecord(
            'test-tenant-id',
            testImagePath,
            'benchmark.png',
            fs.statSync(testImagePath).size,
            'png'
        );

        const startTime = Date.now();

        // Run processing
        const orchestrator = new ProcessingOrchestrator(check.id);
        const result = await orchestrator.execute();

        const duration = Date.now() - startTime;

        console.log('\n=== Benchmark Results ===');
        console.log('Total Duration:', duration, 'ms');
        console.log('Status:', result.status);
        console.log('Confidence:', result.validation.confidenceSummary);
        console.log('\nExtracted Fields:');
        console.log('- Payee:', result.fields.payee?.value);
        console.log('- Amount:', result.fields.amount?.value);
        console.log('- Date:', result.fields.checkDate?.value);
        console.log('- Check #:', result.fields.checkNumber?.value);

    } catch (error) {
        logger.error({ error }, 'Benchmark failed');
        process.exit(1);
    }
}

benchmark();