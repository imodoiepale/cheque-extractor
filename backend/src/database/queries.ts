import supabase from './supabaseClient';
import { CheckFields, ValidationResult } from '../types/extraction';
import { ProcessingStage } from '../types/processing';
import logger from '../utils/logger';

export async function getCheckById(checkId: string) {
    const { data, error } = await supabase
        .from('checks')
        .select('*')
        .eq('id', checkId)
        .single();

    if (error) {
        logger.error({ error, checkId }, 'Failed to get check');
        throw error;
    }

    return data;
}

export async function updateCheckStatus(checkId: string, status: string) {
    const { error } = await supabase
        .from('checks')
        .update({
            status,
            updated_at: new Date().toISOString()
        })
        .eq('id', checkId);

    if (error) {
        logger.error({ error, checkId, status }, 'Failed to update check status');
        throw error;
    }
}

export async function updateCheckFields(
    checkId: string,
    fields: Partial<CheckFields>,
    validation: ValidationResult
) {
    const updateData: any = {
        // Payee
        payee: fields.payee?.value,
        payee_confidence: fields.payee?.confidence,
        payee_source: fields.payee?.source,

        // Amount
        amount: fields.amount?.value,
        amount_confidence: fields.amount?.confidence,
        amount_source: fields.amount?.source,

        // Date
        check_date: fields.checkDate?.value,
        check_date_confidence: fields.checkDate?.confidence,
        check_date_source: fields.checkDate?.source,

        // Check Number
        check_number: fields.checkNumber?.value,
        check_number_confidence: fields.checkNumber?.confidence,
        check_number_source: fields.checkNumber?.source,

        // Bank
        bank_name: fields.bankName?.value,
        bank_name_confidence: fields.bankName?.confidence,
        bank_name_source: fields.bankName?.source,

        // MICR
        micr_routing: fields.micr?.routing?.value,
        micr_routing_confidence: fields.micr?.routing?.confidence,
        micr_account: fields.micr?.account?.value,
        micr_account_confidence: fields.micr?.account?.confidence,
        micr_serial: fields.micr?.serial?.value,
        micr_serial_confidence: fields.micr?.serial?.confidence,

        // Overall
        confidence_summary: validation.confidenceSummary,
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,

        // Status
        status: validation.recommendedStatus,

        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from('checks')
        .update(updateData)
        .eq('id', checkId);

    if (error) {
        logger.error({ error, checkId }, 'Failed to update check fields');
        throw error;
    }
}

export async function saveProcessingStage(
    checkId: string,
    stage: ProcessingStage
) {
    const { error } = await supabase
        .from('processing_stages')
        .upsert({
            check_id: checkId,
            stage_name: stage.name,
            stage_order: stage.order,
            status: stage.status,
            progress: stage.progress,
            stage_data: stage.data,
            started_at: stage.startedAt?.toISOString(),
            completed_at: stage.completedAt?.toISOString(),
            duration_ms: stage.durationMs,
            error_message: stage.errorMessage,
            updated_at: new Date().toISOString(),
        });

    if (error) {
        logger.error({ error, checkId, stage: stage.name }, 'Failed to save processing stage');
        throw error;
    }
}

export async function createAuditLog(
    checkId: string,
    tenantId: string,
    action: string,
    changes: any
) {
    const { error } = await supabase
        .from('audit_logs')
        .insert({
            table_name: 'checks',
            record_id: checkId,
            check_id: checkId,
            tenant_id: tenantId,
            action,
            changes,
            source: 'system',
        });

    if (error) {
        logger.error({ error, checkId }, 'Failed to create audit log');
    }
}