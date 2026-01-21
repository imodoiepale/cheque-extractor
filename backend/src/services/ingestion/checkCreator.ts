import supabase from '../../database/supabaseClient';
import logger from '../../utils/logger';
import { generateId } from '../../utils/helpers';

export async function createCheckRecord(
    tenantId: string,
    fileUrl: string,
    fileName: string,
    fileSize: number,
    fileType: string
) {
    const checkId = generateId();

    const { data, error } = await supabase
        .from('checks')
        .insert({
            id: checkId,
            tenant_id: tenantId,
            status: 'uploaded',
            source_file: fileName,
            file_url: fileUrl,
            file_size: fileSize,
            file_type: fileType,
        })
        .select()
        .single();

    if (error) {
        logger.error({ error, tenantId, fileName }, 'Failed to create check record');
        throw error;
    }

    logger.info({ checkId, tenantId, fileName }, 'Check record created');

    return data;
}