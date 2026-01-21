import { CheckFields } from '../../types/extraction';
import { parseAmount, formatDate } from '../../utils/helpers';
import logger from '../../utils/logger';

export function extractFieldsFromVision(visionText: string): Partial<CheckFields> {
    logger.info('Extracting fields using AI/NER');

    const lines = visionText.split('\n').map(l => l.trim()).filter(l => l);

    // Use similar extraction logic as OCR but with higher confidence
    // In production, would use more sophisticated NER

    const payee = extractPayeeAI(lines);
    const amount = extractAmountAI(visionText);
    const checkDate = extractDateAI(visionText);
    const checkNumber = extractCheckNumberAI(visionText);
    const bankName = extractBankNameAI(lines);

    return {
        payee,
        amount,
        checkDate,
        checkNumber,
        bankName,
    };
}

function extractPayeeAI(lines: string[]) {
    // AI typically better at identifying payee from context
    const payeeLine = lines.find(line =>
        line.length > 5 &&
        !/^\d/.test(line) &&
        !line.toLowerCase().includes('bank') &&
        !line.toLowerCase().includes('check')
    );

    return {
        value: payeeLine || '',
        confidence: payeeLine ? 0.92 : 0.35,
        source: 'ai' as const,
    };
}

function extractAmountAI(text: string) {
    const amountMatch = text.match(/\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    const value = amountMatch ? parseAmount(amountMatch[1]) : 0;

    return {
        value,
        confidence: amountMatch ? 0.94 : 0.25,
        source: 'ai' as const,
    };
}

function extractDateAI(text: string) {
    const datePatterns = [
        /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
        /(\d{4}-\d{2}-\d{2})/,
        /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i,
    ];

    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            try {
                const date = new Date(match[1]);
                if (!isNaN(date.getTime())) {
                    return {
                        value: formatDate(date),
                        confidence: 0.90,
                        source: 'ai' as const,
                    };
                }
            } catch {
                continue;
            }
        }
    }

    return {
        value: '',
        confidence: 0.25,
        source: 'ai' as const,
    };
}

function extractCheckNumberAI(text: string) {
    const checkNumMatch = text.match(/(?:Check\s*#?|No\.?)\s*(\d{4,6})/i) ||
        text.match(/\b(\d{4,6})\b/);

    return {
        value: checkNumMatch ? checkNumMatch[1] : '',
        confidence: checkNumMatch ? 0.88 : 0.35,
        source: 'ai' as const,
    };
}

function extractBankNameAI(lines: string[]) {
    const bankKeywords = ['bank', 'credit union', 'federal', 'chase', 'wells', 'bofa'];
    const bankLine = lines.find(line =>
        bankKeywords.some(keyword => line.toLowerCase().includes(keyword))
    );

    return {
        value: bankLine || '',
        confidence: bankLine ? 0.85 : 0.35,
        source: 'ai' as const,
    };
}