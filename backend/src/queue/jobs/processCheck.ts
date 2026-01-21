import { Job } from 'bull';
import { ProcessingOrchestrator } from '../../services/orchestration';
import logger from '../../utils/logger';

export async function processCheckJob(job: Job) {
    const { checkId } = job.data;

    logger.info({ checkId, jobId: job.id }, 'Processing check job started');

    try {
        const orchestrator = new ProcessingOrchestrator(checkId);
        const result = await orchestrator.execute();

        logger.info({ checkId, jobId: job.id }, 'Processing check job completed');

        return result;
    } catch (error) {
        logger.error({ error, checkId, jobId: job.id }, 'Processing check job failed');
        throw error;
    }
}