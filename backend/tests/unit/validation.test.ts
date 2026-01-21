import { validateRequiredFields } from '../../src/services/validation/requiredFields';
import { validateFormats } from '../../src/services/validation/formatValidator';
import { CheckFields } from '../../src/types/extraction';

describe('Validation Services', () => {
    const validFields: CheckFields = {
        payee: { value: 'ACME Corp', confidence: 0.95, source: 'ai' },
        amount: { value: 1250.00, confidence: 0.98, source: 'ai' },
        checkDate: { value: '2026-01-15', confidence: 0.92, source: 'ocr' },
        checkNumber: { value: '10452', confidence: 0.99, source: 'ocr' },
        bankName: { value: 'Chase Bank', confidence: 0.88, source: 'ocr' },
    };

    test('should validate required fields', () => {
        const errors = validateRequiredFields(validFields);
        expect(errors).toHaveLength(0);
    });

    test('should detect missing required fields', () => {
        const incompleteFields: CheckFields = {
            ...validFields,
            payee: { value: '', confidence: 0, source: 'ocr' },
        };

        const errors = validateRequiredFields(incompleteFields);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].field).toBe('payee');
    });

    test('should validate field formats', () => {
        const errors = validateFormats(validFields);
        expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    });

    test('should detect invalid amount', () => {
        const invalidFields: CheckFields = {
            ...validFields,
            amount: { value: -100, confidence: 0.95, source: 'ai' },
        };

        const errors = validateFormats(invalidFields);
        const amountErrors = errors.filter(e => e.field === 'amount');
        expect(amountErrors.length).toBeGreaterThan(0);
    });
});