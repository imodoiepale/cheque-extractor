import { Job } from 'bull';
import { exportChecksToQBO } from '../../services/export';
import logger from '../../utils/logger';

export async function exportCheckJob(job: Job) {
    const { tenantId, checkIds, realmId, exportType } = job.data;

    logger.info({ tenantId, checkIds, jobId: job.id }, 'Export check job started');

    try {
        if (exportType === 'qbo_api') {
            const result = await exportChecksToQBO(tenantId, checkIds, realmId);

            logger.info({ tenantId, batchId: result.batchId, jobId: job.id }, 'Export check job completed');

            return result;
        }

        throw new Error(`Unsupported export type: ${exportType}`);
    } catch (error) {
        logger.error({ error, tenantId, jobId: job.id }, 'Export check job failed');
        throw error;
    }
}