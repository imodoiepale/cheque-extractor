export * from './geminiClient';
export * from './nerExtractor';

import { analyzeCheckWithGemini } from './geminiClient';
import { CheckFields } from '../../types/extraction';

export async function extractWithAI(imageBuffer: Buffer): Promise<Partial<CheckFields>> {
    const geminiData = await analyzeCheckWithGemini(imageBuffer);
    
    // Convert Gemini response to CheckFields format
    const fields: Partial<CheckFields> = {
        payee: {
            value: geminiData.payee,
            confidence: geminiData.confidence,
            source: 'ai',
        },
        amount: {
            value: geminiData.amount,
            confidence: geminiData.confidence,
            source: 'ai',
        },
        checkDate: {
            value: geminiData.date,
            confidence: geminiData.confidence,
            source: 'ai',
        },
        checkNumber: {
            value: geminiData.checkNumber,
            confidence: geminiData.confidence,
            source: 'ai',
        },
        bankName: {
            value: geminiData.bankName,
            confidence: geminiData.confidence,
            source: 'ai',
        },
    };

    if (geminiData.micrRouting || geminiData.micrAccount) {
        fields.micr = {
            routing: {
                value: geminiData.micrRouting || '',
                confidence: geminiData.confidence,
                source: 'ai',
            },
            account: {
                value: geminiData.micrAccount || '',
                confidence: geminiData.confidence,
                source: 'ai',
            },
            serial: {
                value: '',
                confidence: 0,
                source: 'ai',
            },
        };
    }

    return fields;
}