export * from './requiredFields';
export * from './formatValidator';
export * from './duplicateDetector';

import { CheckFields, ValidationResult } from '../../types/extraction';
import { validateRequiredFields } from './requiredFields';
import { validateFormats } from './formatValidator';
import { detectDuplicates } from './duplicateDetector';
import { CONFIDENCE_THRESHOLDS } from '../../utils/constants';
import { calculateConfidence } from '../../utils/helpers';
import logger from '../../utils/logger';

export async function validateCheck(
    tenantId: string,
    fields: CheckFields
): Promise<ValidationResult> {
    logger.info({ tenantId }, 'Validating check');

    const errors = [
        ...validateRequiredFields(fields),
        ...validateFormats(fields),
        ...(await detectDuplicates(tenantId, fields)),
    ];

    const warnings = errors.filter(e => e.severity === 'warning');
    const criticalErrors = errors.filter(e => e.severity === 'error');

    // Calculate overall confidence
    const confidences = [
        fields.payee?.confidence || 0,
        fields.amount?.confidence || 0,
        fields.checkDate?.confidence || 0,
        fields.checkNumber?.confidence || 0,
        fields.bankName?.confidence || 0,
    ].filter(c => c > 0);

    const confidenceSummary = calculateConfidence(confidences);

    // Determine recommended status
    let recommendedStatus: 'approved' | 'review_suggested' | 'review_required';

    if (criticalErrors.length > 0 || confidenceSummary < CONFIDENCE_THRESHOLDS.REVIEW_SUGGESTED) {
        recommendedStatus = 'review_required';
    } else if (warnings.length > 0 || confidenceSummary < CONFIDENCE_THRESHOLDS.AUTO_APPROVE) {
        recommendedStatus = 'review_suggested';
    } else {
        recommendedStatus = 'approved';
    }

    logger.info({
        errors: criticalErrors.length,
        warnings: warnings.length,
        confidence: confidenceSummary,
        status: recommendedStatus,
    }, 'Validation completed');

    return {
        isValid: criticalErrors.length === 0,
        errors: criticalErrors,
        warnings,
        confidenceSummary,
        recommendedStatus,
    };
}