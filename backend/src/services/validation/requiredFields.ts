import { CheckFields, ValidationError } from '../../types/extraction';

export function validateRequiredFields(fields: CheckFields): ValidationError[] {
    const errors: ValidationError[] = [];

    const requiredFields: Array<{ key: keyof CheckFields; name: string }> = [
        { key: 'payee', name: 'Payee' },
        { key: 'amount', name: 'Amount' },
        { key: 'checkDate', name: 'Check Date' },
        { key: 'checkNumber', name: 'Check Number' },
    ];

    for (const field of requiredFields) {
        const value = fields[field.key];
        if (!value || !value.value || value.value === '') {
            errors.push({
                field: field.key,
                message: `${field.name} is required`,
                severity: 'error',
                code: 'REQUIRED_FIELD_MISSING',
            });
        }
    }

    return errors;
}