import supabase from '../../../database/supabaseClient';
import logger from '../../../utils/logger';

export async function updateSyncStatus(
    checkId: string,
    success: boolean,
    transactionId?: string,
    errorMessage?: string
) {
    try {
        await supabase
            .from('checks')
            .update({
                qbo_synced: success,
                qbo_transaction_id: transactionId,
                qbo_sync_error: errorMessage,
                qbo_synced_at: success ? new Date().toISOString() : null,
                exported: success,
                exported_at: success ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', checkId);

        logger.info({ checkId, success }, 'Sync status updated');
    } catch (error) {
        logger.error({ error, checkId }, 'Failed to update sync status');
    }
}