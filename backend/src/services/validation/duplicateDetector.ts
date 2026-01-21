import supabase from '../../database/supabaseClient';
import { CheckFields, ValidationError } from '../../types/extraction';
import logger from '../../utils/logger';

export async function detectDuplicates(
    tenantId: string,
    fields: CheckFields
): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
        // Check for duplicate check number + amount + date
        const { data: duplicates, error } = await supabase
            .from('checks')
            .select('id, check_number, amount, check_date')
            .eq('tenant_id', tenantId)
            .eq('check_number', fields.checkNumber?.value)
            .eq('amount', fields.amount?.value)
            .eq('check_date', fields.checkDate?.value)
            .is('deleted_at', null)
            .neq('status', 'rejected');

        if (error) {
            logger.error({ error }, 'Failed to check for duplicates');
            return errors;
        }

        if (duplicates && duplicates.length > 0) {
            errors.push({
                field: 'checkNumber',
                message: `Potential duplicate: Check #${fields.checkNumber?.value} with same amount and date already exists`,
                severity: 'warning',
                code: 'DUPLICATE_CHECK',
            });
        }
    } catch (error) {
        logger.error({ error }, 'Duplicate detection failed');
    }

    return errors;
}