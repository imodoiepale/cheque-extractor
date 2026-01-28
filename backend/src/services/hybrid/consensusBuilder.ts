import { CheckFields, FieldExtraction } from '../../types/extraction';
import logger from '../../utils/logger';

interface ConsensusResult {
    field: FieldExtraction;
    agreement: 'full' | 'partial' | 'conflict';
    sources: ('ocr' | 'ai')[];
}

export function buildFieldConsensus(
    ocrField: FieldExtraction | undefined,
    aiField: FieldExtraction | undefined,
    fieldName: string
): ConsensusResult {
    try {
        // Both missing
        if (!ocrField && !aiField) {
            return {
                field: { value: '', confidence: 0, source: 'hybrid' },
                agreement: 'conflict',
                sources: [],
            };
        }

        // Only one source
        if (!ocrField) {
            return {
                field: { ...aiField!, source: 'ai' },
                agreement: 'partial',
                sources: ['ai'],
            };
        }

        if (!aiField) {
            return {
                field: { ...ocrField!, source: 'ocr' },
                agreement: 'partial',
                sources: ['ocr'],
            };
        }

        // Both sources available - check agreement
        const valuesMatch = normalizeValue(ocrField.value) === normalizeValue(aiField.value);

        if (valuesMatch) {
            // Full agreement - use higher confidence
            const bestField = ocrField.confidence >= aiField.confidence ? ocrField : aiField;

            // Boost confidence due to agreement
            const boostedConfidence = Math.min(1.0, bestField.confidence * 1.1);

            logger.debug({ fieldName, agreement: 'full' }, 'Field consensus: full agreement');

            return {
                field: {
                    ...bestField,
                    confidence: boostedConfidence,
                    source: 'hybrid',
                },
                agreement: 'full',
                sources: ['ocr', 'ai'],
            };
        }

        // Conflict - use higher confidence but mark as partial agreement
        const bestField = ocrField.confidence >= aiField.confidence ? ocrField : aiField;

        // Reduce confidence due to conflict
        const reducedConfidence = bestField.confidence * 0.85;

        logger.debug({
            fieldName,
            ocrValue: ocrField.value,
            aiValue: aiField.value,
            agreement: 'conflict'
        }, 'Field consensus: conflict detected');

        return {
            field: {
                ...bestField,
                confidence: reducedConfidence,
                source: 'hybrid',
            },
            agreement: 'conflict',
            sources: ['ocr', 'ai'],
        };

    } catch (error) {
        logger.error({ error, fieldName }, 'Consensus building failed');
        return {
            field: { value: '', confidence: 0, source: 'hybrid' },
            agreement: 'conflict',
            sources: [],
        };
    }
}

function normalizeValue(value: any): string {
    if (value === null || value === undefined) return '';

    const str = String(value).toLowerCase().trim();

    // Remove common variations
    return str
        .replace(/[.,\s]/g, '') // Remove punctuation and spaces
        .replace(/^0+/, ''); // Remove leading zeros
}

export function buildCompleteConsensus(
    ocrFields: Partial<CheckFields>,
    aiFields: Partial<CheckFields>
): {
    fields: CheckFields;
    consensusReport: Record<string, ConsensusResult>;
} {
    const consensusReport: Record<string, ConsensusResult> = {};
    const fields: any = {};

    const fieldNames: (keyof CheckFields)[] = [
        'payee',
        'amount',
        'checkDate',
        'checkNumber',
        'bankName',
    ];

    for (const fieldName of fieldNames) {
        const consensus = buildFieldConsensus(
            ocrFields[fieldName] as FieldExtraction,
            aiFields[fieldName] as FieldExtraction,
            fieldName
        );

        fields[fieldName] = consensus.field;
        consensusReport[fieldName] = consensus;
    }

    // Handle MICR specially (OCR usually better)
    if (ocrFields.micr) {
        fields.micr = ocrFields.micr;
    }

    // Calculate overall consensus score
    const agreementCounts = Object.values(consensusReport).reduce(
        (acc, result) => {
            acc[result.agreement]++;
            return acc;
        },
        { full: 0, partial: 0, conflict: 0 }
    );

    logger.info({
        agreementCounts,
        totalFields: fieldNames.length
    }, 'Complete consensus built');

    return {
        fields: fields as CheckFields,
        consensusReport,
    };
}

export function getConsensusScore(consensusReport: Record<string, ConsensusResult>): number {
    const results = Object.values(consensusReport);

    if (results.length === 0) return 0;

    const scores = results.map(result => {
        switch (result.agreement) {
            case 'full': return 1.0;
            case 'partial': return 0.7;
            case 'conflict': return 0.3;
            default: return 0;
        }
    });

    const avgScore = scores.reduce((sum: number, score) => sum + score, 0) / scores.length;

    return avgScore;
}