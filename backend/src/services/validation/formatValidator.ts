import { CheckFields, ValidationError } from '../../types/extraction';
import { isValidRoutingNumber } from '../../utils/helpers';

export function validateFormats(fields: CheckFields): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate amount
    if (fields.amount?.value && (fields.amount.value <= 0 || fields.amount.value > 1000000)) {
        errors.push({
            field: 'amount',
            message: 'Amount must be between $0 and $1,000,000',
            severity: 'error',
            code: 'INVALID_AMOUNT',
        });
    }

    // Validate date
    if (fields.checkDate?.value) {
        const date = new Date(fields.checkDate.value);
        if (isNaN(date.getTime())) {
            errors.push({
                field: 'checkDate',
                message: 'Invalid date format',
                severity: 'error',
                code: 'INVALID_DATE',
            });
        } else {
            // Check if date is in the future
            if (date > new Date()) {
                errors.push({
                    field: 'checkDate',
                    message: 'Check date is in the future',
                    severity: 'warning',
                    code: 'FUTURE_DATE',
                });
            }
        }
    }

    // Validate MICR routing number
    if (fields.micr?.routing?.value) {
        if (!isValidRoutingNumber(fields.micr.routing.value)) {
            errors.push({
                field: 'micr.routing',
                message: 'Invalid routing number (failed checksum)',
                severity: 'error',
                code: 'INVALID_ROUTING',
            });
        }
    }

    return errors;
}