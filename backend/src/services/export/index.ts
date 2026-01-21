export * from './quickbooks';
export * from './csv';

import { getCheckById } from '../../database/queries';
import { createCheckInQBO, checkForDuplicateInQBO, updateSyncStatus } from './quickbooks';
import { generateQBOCSV } from './csv';
import { QBOCheckData, BatchExportResult, ExportResult } from '../../types/export';
import { generateId } from '../../utils/helpers';
import logger from '../../utils/logger';
import supabase from '../../database/supabaseClient';

export async function exportChecksToQBO(
    tenantId: string,
    checkIds: string[],
    realmId: string
): Promise<BatchExportResult> {
    const batchId = generateId();
    const results: ExportResult[] = [];

    logger.info({ batchId, tenantId, checkCount: checkIds.length }, 'Starting QBO export batch');

    for (const checkId of checkIds) {
        try {
            const check = await getCheckById(checkId);

            // Check for duplicate
            const isDuplicate = await checkForDuplicateInQBO(
                tenantId,
                realmId,
                check.check_number,
                check.amount,
                check.check_date
            );

            if (isDuplicate) {
                results.push({
                    success: false,
                    checkId,
                    errorMessage: 'Duplicate check already exists in QuickBooks',
                    exportedAt: new Date(),
                });
                continue;
            }

            // Create check in QBO
            const qboData: QBOCheckData = {
                txnDate: check.check_date,
                payee: check.payee,
                amount: check.amount,
                checkNumber: check.check_number,
                bankAccount: check.micr_account || 'Unknown',
                memo: check.memo,
            };

            const result = await createCheckInQBO(tenantId, realmId, qboData, checkId);
            results.push(result);

            // Update sync status
            await updateSyncStatus(
                checkId,
                result.success,
                result.transactionId,
                result.errorMessage
            );
        } catch (error: any) {
            logger.error({ error, checkId }, 'Failed to export check');
            results.push({
                success: false,
                checkId,
                errorMessage: error.message,
                exportedAt: new Date(),
            });
        }
    }

    const successfulCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    // Save to export history
    await supabase.from('export_history').insert({
        tenant_id: tenantId,
        batch_id: batchId,
        export_type: 'qbo_api',
        check_ids: checkIds,
        total_checks: checkIds.length,
        successful_count: successfulCount,
        failed_count: failedCount,
        status: failedCount === 0 ? 'success' : successfulCount > 0 ? 'partial_success' : 'failed',
        check_results: results,
    });

    logger.info({ batchId, successfulCount, failedCount }, 'QBO export batch completed');

    return {
        batchId,
        totalChecks: checkIds.length,
        successfulCount,
        failedCount,
        results,
        exportType: 'qbo_api',
    };
}

export async function exportChecksToCSV(
    tenantId: string,
    checkIds: string[]
): Promise<{ filePath: string; fileName: string }> {
    logger.info({ tenantId, checkCount: checkIds.length }, 'Generating CSV export');

    const checks: QBOCheckData[] = [];

    for (const checkId of checkIds) {
        const check = await getCheckById(checkId);
        checks.push({
            txnDate: check.check_date,
            payee: check.payee,
            amount: check.amount,
            checkNumber: check.check_number,
            bankAccount: check.micr_account || 'Unknown',
            memo: check.memo,
        });
    }

    return await generateQBOCSV(checks);
}