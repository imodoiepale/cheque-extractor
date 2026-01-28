import { CheckFields, ValidationError } from '../../types/extraction';

export function validateRequiredFields(fields: CheckFields): ValidationError[] {
    const errors: ValidationError[] = [];

    const requiredFields: Array<{ key: keyof CheckFields; name: string }> = [
        { key: 'payee', name: 'Payee' },
        { key: 'amount', name: 'Amount' },
        { key: 'checkDate', name: 'Check Date' },
        { key: 'checkNumber', name: 'Check Number' },
        { key: 'micr', name: 'MICR' },
    ];

    for (const field of requiredFields) {
        const value = fields[field.key];
        
        // Handle MICR field specially (it's an object, not FieldExtraction)
        if (field.key === 'micr') {
            if (!value) {
                errors.push({
                    field: field.key,
                    message: `${field.name} is required`,
                    severity: 'error',
                    code: 'REQUIRED_FIELD_MISSING',
                });
            }
        } else {
            // Standard FieldExtraction fields
            if (!value || !(value as any).value || (value as any).value === '') {
                errors.push({
                    field: field.key,
                    message: `${field.name} is required`,
                    severity: 'error',
                    code: 'REQUIRED_FIELD_MISSING',
                });
            }
        }
    }

    return errors;
}