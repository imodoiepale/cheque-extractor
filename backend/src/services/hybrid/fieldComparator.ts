import { CheckField } from '../types'
import { ExtractedFieldsOCR } from '../ocr/tesseract'
import { ExtractedFieldsAI } from '../ai/vision'
import { ExtractedCheck, MICRData } from '../types'

/**
 * Compare OCR and AI results to select the best value for each field
 */
export function hybridSelect(
    ocrFields: ExtractedFieldsOCR,
    aiFields: ExtractedFieldsAI
): ExtractedCheck {
    return {
        payee: selectBest(ocrFields.payee, aiFields.payee),
        amount: selectBest(ocrFields.amount, aiFields.amount),
        checkDate: selectBest(ocrFields.checkDate, aiFields.checkDate),
        checkNumber: selectBest(ocrFields.checkNumber, aiFields.checkNumber),
        bank: selectBest(ocrFields.bank, aiFields.bank),
        micr: {
            routing: selectBest(ocrFields.micr.routing, aiFields.micr.routing),
            account: selectBest(ocrFields.micr.account, aiFields.micr.account),
            serial: selectBest(ocrFields.micr.serial, aiFields.micr.serial),
        },
        confidenceSummary: 0 // Will be calculated later
    }
}

/**
 * Select the best field based on confidence scores
 */
function selectBest<T>(fieldOCR: CheckField<T>, fieldAI: CheckField<T>): CheckField<T> {
    // If both are high confidence (> 0.9), prefer AI as it handles context better
    if (fieldOCR.confidence >= 0.9 && fieldAI.confidence >= 0.9) {
        return fieldAI
    }

    // If AI is significantly better, pick AI
    if (fieldAI.confidence > fieldOCR.confidence + 0.1) {
        return fieldAI
    }

    // If OCR is significantly better, pick OCR
    if (fieldOCR.confidence > fieldAI.confidence + 0.1) {
        return fieldOCR
    }

    // Validation tie-breakers could go here (e.g. check regex format)
    // Default to higher confidence
    return fieldOCR.confidence >= fieldAI.confidence ? fieldOCR : fieldAI
}

/**
 * Calculate overall confidence summary for the check
 */
export function calculateConfidenceSummary(check: ExtractedCheck): number {
    const weights = {
        amount: 0.3,
        payee: 0.2,
        date: 0.1,
        micr: 0.2, // combined routing/account
        checkNumber: 0.1,
        bank: 0.1
    }

    let weightedSum = 0

    weightedSum += check.amount.confidence * weights.amount
    weightedSum += check.payee.confidence * weights.payee
    weightedSum += check.checkDate.confidence * weights.date
    weightedSum += check.checkNumber.confidence * weights.checkNumber
    weightedSum += check.bank.confidence * weights.bank

    // Average MICR confidence
    const micrAvg = (
        check.micr.routing.confidence +
        check.micr.account.confidence +
        check.micr.serial.confidence
    ) / 3

    weightedSum += micrAvg * weights.micr

    return parseFloat(weightedSum.toFixed(2))
}
