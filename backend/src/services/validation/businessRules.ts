import { differenceInDays, parseISO, isValid } from 'date-fns'

export interface ValidationResult {
    isValid: boolean
    errors: string[]
    warnings: string[]
}

/**
 * Validate extracted check data against business rules
 */
export function validateCheckData(data: any): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. Required Fields
    if (!data.payee?.value) errors.push('Payee is missing')
    if (!data.amount?.value) errors.push('Amount is missing')
    if (!data.checkDate?.value) errors.push('Date is missing')

    // 2. Date Validation
    if (data.checkDate?.value) {
        const date = parseISO(data.checkDate.value)
        if (!isValid(date)) {
            errors.push('Invalid date format')
        } else {
            const daysDiff = differenceInDays(new Date(), date)
            if (daysDiff < 0) {
                warnings.push('Check date is in the future')
            } else if (daysDiff > 180) { // Stale check (> 6 months)
                warnings.push('Check is older than 6 months (stale date)')
            }
        }
    }

    // 3. Amount Validation
    if (data.amount?.value) {
        if (data.amount.value <= 0) {
            errors.push('Amount must be greater than zero')
        }
        if (data.amount.value > 50000) {
            warnings.push('High value check (> $50,000) - please review carefully')
        }
    }

    // 4. MICR Validation
    const micr = data.micr || {}
    if (!micr.routing?.value) {
        errors.push('Routing number missing')
    } else if (!isValidRoutingNumber(micr.routing.value)) {
        errors.push('Invalid routing number checksum')
    }

    if (!micr.account?.value) {
        errors.push('Account number missing')
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    }
}

/**
 * Validate US Routing Number Checksum (ABA)
 * 3-7-1-3-7-1-3-7-1 weights
 */
function isValidRoutingNumber(routing: string): boolean {
    if (!/^\d{9}$/.test(routing)) return false

    const weights = [3, 7, 1, 3, 7, 1, 3, 7]
    let sum = 0

    for (let i = 0; i < 8; i++) {
        sum += parseInt(routing[i]) * weights[i]
    }

    const checkDigit = Math.ceil(sum / 10) * 10 - sum
    return checkDigit === parseInt(routing[8])
}
