import { CheckFields, FieldExtraction } from '../../types/extraction';
import logger from '../../utils/logger';

export function selectBestFields(
    ocrFields: Partial<CheckFields>,
    aiFields: Partial<CheckFields>
): CheckFields {
    logger.info('Selecting best fields from OCR and AI results');

    const selected: any = {};

    // Compare each field
    const fieldNames: (keyof CheckFields)[] = [
        'payee',
        'amount',
        'checkDate',
        'checkNumber',
        'bankName',
    ];

    for (const fieldName of fieldNames) {
        const ocrField = ocrFields[fieldName] as FieldExtraction | undefined;
        const aiField = aiFields[fieldName] as FieldExtraction | undefined;

        selected[fieldName] = selectBestField(ocrField, aiField, fieldName);
    }

    // MICR data usually better from OCR (specialized parsing)
    if (ocrFields.micr) {
        selected.micr = ocrFields.micr;
    }

    logger.info('Field selection completed');

    return selected as CheckFields;
}

function selectBestField(
    ocrField: FieldExtraction | undefined,
    aiField: FieldExtraction | undefined,
    fieldName: string
): FieldExtraction {
    // If only one exists, use it
    if (!ocrField && !aiField) {
        return { value: '', confidence: 0, source: 'hybrid' };
    }
    if (!ocrField) return { ...aiField!, source: 'ai' };
    if (!aiField) return { ...ocrField!, source: 'ocr' };

    // Both exist - compare confidence
    if (ocrField.confidence >= 0.9 && aiField.confidence >= 0.9) {
        // Both high confidence - pick highest
        const best = ocrField.confidence >= aiField.confidence ? ocrField : aiField;
        logger.debug({ fieldName, selected: best.source }, 'Both high confidence');
        return { ...best, source: best.source };
    }

    if (ocrField.confidence >= 0.9) {
        logger.debug({ fieldName, selected: 'ocr' }, 'OCR high confidence');
        return { ...ocrField, source: 'ocr' };
    }

    if (aiField.confidence >= 0.9) {
        logger.debug({ fieldName, selected: 'ai' }, 'AI high confidence');
        return { ...aiField, source: 'ai' };
    }

    // Neither high confidence - pick higher one, mark as hybrid
    const best = ocrField.confidence >= aiField.confidence ? ocrField : aiField;
    logger.debug({ fieldName, ocrConf: ocrField.confidence, aiConf: aiField.confidence }, 'Hybrid selection');

    return {
        ...best,
        source: 'hybrid',
    };
}