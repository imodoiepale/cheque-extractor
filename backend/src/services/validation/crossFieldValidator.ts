import { CheckFields, ValidationError } from '../../types/extraction';
import { parseAmount } from '../../utils/helpers';
import logger from '../../utils/logger';

export function validateCrossFieldConsistency(fields: CheckFields): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
        // Validate amount consistency (numeric vs written)
        if (fields.amount && fields.amountWritten) {
            const numericAmount = fields.amount.value;
            const writtenAmount = parseWrittenAmount(fields.amountWritten.value);

            if (writtenAmount > 0 && Math.abs(numericAmount - writtenAmount) > 0.01) {
                errors.push({
                    field: 'amount',
                    message: `Amount mismatch: numeric ($${numericAmount}) vs written ($${writtenAmount})`,
                    severity: 'error',
                    code: 'AMOUNT_MISMATCH',
                });
            }
        }

        // Validate check number vs MICR serial
        if (fields.checkNumber && fields.micr?.serial) {
            const checkNum = fields.checkNumber.value;
            const micrSerial = fields.micr.serial.value;

            if (checkNum !== micrSerial) {
                errors.push({
                    field: 'checkNumber',
                    message: `Check number (${checkNum}) does not match MICR serial (${micrSerial})`,
                    severity: 'warning',
                    code: 'CHECK_NUMBER_MICR_MISMATCH',
                });
            }
        }

        // Validate date reasonableness
        if (fields.checkDate) {
            const date = new Date(fields.checkDate.value);
            const now = new Date();

            // Check if date is too far in the past (> 1 year)
            const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            if (date < oneYearAgo) {
                errors.push({
                    field: 'checkDate',
                    message: `Check date (${fields.checkDate.value}) is more than 1 year old`,
                    severity: 'warning',
                    code: 'OLD_CHECK_DATE',
                });
            }

            // Check if date is in the future (> 1 month)
            const oneMonthAhead = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
            if (date > oneMonthAhead) {
                errors.push({
                    field: 'checkDate',
                    message: `Check date (${fields.checkDate.value}) is post-dated`,
                    severity: 'warning',
                    code: 'FUTURE_CHECK_DATE',
                });
            }
        }

        // Validate payee is not empty or generic
        if (fields.payee) {
            const payee = fields.payee.value.toLowerCase();
            const genericPayees = ['cash', 'bearer', 'to order of'];

            if (genericPayees.some(generic => payee.includes(generic))) {
                errors.push({
                    field: 'payee',
                    message: `Payee appears to be generic: ${fields.payee.value}`,
                    severity: 'warning',
                    code: 'GENERIC_PAYEE',
                });
            }
        }

        // Validate amount reasonableness
        if (fields.amount) {
            const amount = fields.amount.value;

            // Suspiciously round amounts
            if (amount >= 1000 && amount % 1000 === 0) {
                errors.push({
                    field: 'amount',
                    message: `Amount is unusually round: $${amount}`,
                    severity: 'warning',
                    code: 'ROUND_AMOUNT',
                });
            }

            // Very large amounts
            if (amount > 100000) {
                errors.push({
                    field: 'amount',
                    message: `Amount is very large: $${amount}`,
                    severity: 'warning',
                    code: 'LARGE_AMOUNT',
                });
            }
        }

        logger.debug({ errorCount: errors.length }, 'Cross-field validation completed');

    } catch (error) {
        logger.error({ error }, 'Cross-field validation failed');
    }

    return errors;
}

function parseWrittenAmount(writtenAmount: string): number {
    try {
        // This is a simplified version
        // In production, use a library like written-number or implement full parser

        const numberWords: Record<string, number> = {
            'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
            'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
            'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
            'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
            'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30,
            'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
            'eighty': 80, 'ninety': 90, 'hundred': 100, 'thousand': 1000,
            'million': 1000000,
        };

        const text = writtenAmount.toLowerCase().replace(/[^a-z\s]/g, '');
        const words = text.split(/\s+/);

        let total = 0;
        let current = 0;

        for (const word of words) {
            const value = numberWords[word];

            if (value !== undefined) {
                if (value >= 100) {
                    current *= value;
                    if (value >= 1000) {
                        total += current;
                        current = 0;
                    }
                } else {
                    current += value;
                }
            }
        }

        total += current;

        return total;
    } catch (error) {
        logger.error({ error, writtenAmount }, 'Failed to parse written amount');
        return 0;
    }
}

export function checkFieldCompleteness(fields: CheckFields): {
    completeness: number;
    missingFields: string[];
} {
    const requiredFields = ['payee', 'amount', 'checkDate', 'checkNumber'];
    const optionalFields = ['bankName', 'micr', 'memo'];

    const presentRequired = requiredFields.filter(field =>
        fields[field as keyof CheckFields]?.value
    );

    const presentOptional = optionalFields.filter(field =>
        fields[field as keyof CheckFields]?.value
    );

    const completeness = (
        (presentRequired.length / requiredFields.length) * 0.8 +
        (presentOptional.length / optionalFields.length) * 0.2
    );

    const missingFields = requiredFields.filter(field =>
        !fields[field as keyof CheckFields]?.value
    );

    return {
        completeness,
        missingFields,
    };
}