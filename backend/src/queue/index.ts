import { checkProcessingQueue, checkExportQueue } from './worker';
import { processCheckJob } from './jobs/processCheck';
import { exportCheckJob } from './jobs/exportCheck';
import logger from '../utils/logger';

// Register job processors
checkProcessingQueue.process(processCheckJob);
checkExportQueue.process(exportCheckJob);

// Event listeners
checkProcessingQueue.on('completed', (job, result) => {
    logger.info({ jobId: job.id, checkId: result.checkId }, 'Check processing completed');
});

checkProcessingQueue.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err }, 'Check processing failed');
});

checkExportQueue.on('completed', (job, result) => {
    logger.info({ jobId: job.id, batchId: result.batchId }, 'Check export completed');
});

checkExportQueue.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err }, 'Check export failed');
});

export { checkProcessingQueue, checkExportQueue };