import { CONFIDENCE_THRESHOLDS } from '../../utils/constants';
import logger from '../../utils/logger';

export interface ConfidenceThresholds {
    autoApprove: number;
    reviewSuggested: number;
    reviewRequired: number;
}

export function getDefaultThresholds(): ConfidenceThresholds {
    return {
        autoApprove: CONFIDENCE_THRESHOLDS.AUTO_APPROVE,
        reviewSuggested: CONFIDENCE_THRESHOLDS.REVIEW_SUGGESTED,
        reviewRequired: 0,
    };
}

export function determineReviewStatus(
    confidenceSummary: number,
    thresholds: ConfidenceThresholds = getDefaultThresholds()
): 'approved' | 'review_suggested' | 'review_required' {
    if (confidenceSummary >= thresholds.autoApprove) {
        logger.debug({ confidenceSummary }, 'Status: auto-approved');
        return 'approved';
    }

    if (confidenceSummary >= thresholds.reviewSuggested) {
        logger.debug({ confidenceSummary }, 'Status: review suggested');
        return 'review_suggested';
    }

    logger.debug({ confidenceSummary }, 'Status: review required');
    return 'review_required';
}

export function calculateFieldPriority(
    fieldName: string,
    confidence: number
): 'high' | 'medium' | 'low' {
    // Critical fields require higher confidence
    const criticalFields = ['amount', 'payee', 'checkNumber'];

    if (criticalFields.includes(fieldName)) {
        if (confidence < 0.85) return 'high';
        if (confidence < 0.95) return 'medium';
        return 'low';
    }

    // Non-critical fields
    if (confidence < 0.70) return 'high';
    if (confidence < 0.85) return 'medium';
    return 'low';
}

export function getReviewPriorityFields(
    fields: Record<string, { confidence: number }>,
    thresholds: ConfidenceThresholds = getDefaultThresholds()
): Array<{ field: string; confidence: number; priority: 'high' | 'medium' | 'low' }> {
    const reviewFields: Array<{ field: string; confidence: number; priority: 'high' | 'medium' | 'low' }> = [];

    Object.entries(fields).forEach(([fieldName, fieldData]) => {
        if (fieldData.confidence < thresholds.autoApprove) {
            const priority = calculateFieldPriority(fieldName, fieldData.confidence);

            reviewFields.push({
                field: fieldName,
                confidence: fieldData.confidence,
                priority,
            });
        }
    });

    // Sort by priority (high first)
    return reviewFields.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
}

export function shouldAutoExport(
    confidenceSummary: number,
    hasValidationErrors: boolean,
    tenantSettings?: { autoExportThreshold?: number }
): boolean {
    const threshold = tenantSettings?.autoExportThreshold || CONFIDENCE_THRESHOLDS.AUTO_APPROVE;

    const canAutoExport = confidenceSummary >= threshold && !hasValidationErrors;

    logger.debug({
        confidenceSummary,
        threshold,
        hasErrors: hasValidationErrors,
        canAutoExport
    }, 'Auto-export decision');

    return canAutoExport;
}