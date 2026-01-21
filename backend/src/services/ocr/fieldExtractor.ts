import Tesseract from 'tesseract.js';
import { CheckFields } from '../../types/extraction';
import { parseAmount, formatDate } from '../../utils/helpers';
import { parseMICRLine } from './micrParser';
import logger from '../../utils/logger';

export function extractFieldsFromOCR(ocrData: Tesseract.Page): Partial<CheckFields> {
    const text = ocrData.text;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    logger.info('Extracting fields from OCR text');

    // Extract payee (typically first substantial text line)
    const payee = extractPayee(lines);

    // Extract amount
    const amount = extractAmount(text);

    // Extract date
    const checkDate = extractDate(text);

    // Extract check number
    const checkNumber = extractCheckNumber(text);

    // Extract bank name
    const bankName = extractBankName(lines);

    // Extract MICR data
    const micr = parseMICRLine(text);

    return {
        payee,
        amount,
        checkDate,
        checkNumber,
        bankName,
        micr: micr || undefined,
    };
}

function extractPayee(lines: string[]) {
    // Find first line with substantial text (likely payee)
    const payeeLine = lines.find(line => line.length > 5 && !/^\d/.test(line));

    return {
        value: payeeLine || '',
        confidence: payeeLine ? 0.80 : 0.30,
        source: 'ocr' as const,
        rawText: payeeLine,
    };
}

function extractAmount(text: string) {
    // Look for currency amount pattern: $1,234.56
    const amountMatch = text.match(/\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);

    const value = amountMatch ? parseAmount(amountMatch[1]) : 0;

    return {
        value,
        confidence: amountMatch ? 0.85 : 0.20,
        source: 'ocr' as const,
        rawText: amountMatch ? amountMatch[0] : undefined,
    };
}

function extractDate(text: string) {
    // Look for date patterns: 01/15/2026, 2026-01-15, Jan 15, 2026
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
                        confidence: 0.85,
                        source: 'ocr' as const,
                        rawText: match[1],
                    };
                }
            } catch {
                continue;
            }
        }
    }

    return {
        value: '',
        confidence: 0.20,
        source: 'ocr' as const,
    };
}

function extractCheckNumber(text: string) {
    // Look for check number (typically 4-6 digits in top-right)
    const checkNumMatch = text.match(/(?:Check\s*#?|No\.?)\s*(\d{4,6})/i) ||
        text.match(/\b(\d{4,6})\b/);

    return {
        value: checkNumMatch ? checkNumMatch[1] : '',
        confidence: checkNumMatch ? 0.80 : 0.30,
        source: 'ocr' as const,
        rawText: checkNumMatch ? checkNumMatch[0] : undefined,
    };
}

function extractBankName(lines: string[]) {
    // Bank name typically in top center
    // Look for common bank keywords
    const bankKeywords = ['bank', 'credit union', 'federal', 'chase', 'wells', 'bofa'];
    const bankLine = lines.find(line =>
        bankKeywords.some(keyword => line.toLowerCase().includes(keyword))
    );

    return {
        value: bankLine || '',
        confidence: bankLine ? 0.75 : 0.30,
        source: 'ocr' as const,
        rawText: bankLine,
    };
}