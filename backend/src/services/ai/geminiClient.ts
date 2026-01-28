import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../utils/logger';
import { AIError } from '../../utils/errors';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

interface GeminiCheckData {
    payee: string;
    amount: number;
    date: string;
    checkNumber: string;
    bankName: string;
    micrRouting?: string;
    micrAccount?: string;
    confidence: number;
}

export async function analyzeCheckWithGemini(imageBuffer: Buffer): Promise<GeminiCheckData> {
    try {
        logger.info('Calling Gemini 2.5 Flash API for check analysis');

        // Use Gemini 2.5 Flash model
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Convert image to base64
        const base64Image = imageBuffer.toString('base64');

        // Create the prompt for check extraction
        const prompt = `Analyze this check image and extract the following information in JSON format:
{
  "payee": "Name of the payee/recipient",
  "amount": "Numeric amount (just the number, no currency symbol)",
  "date": "Date in YYYY-MM-DD format",
  "checkNumber": "Check number",
  "bankName": "Name of the bank",
  "micrRouting": "MICR routing number if visible",
  "micrAccount": "MICR account number if visible",
  "confidence": "Your confidence level from 0 to 1"
}

Important:
- Extract exact text as it appears on the check
- For amount, extract the numerical value only
- For date, convert to YYYY-MM-DD format
- Return ONLY valid JSON, no additional text
- If a field is not clearly visible, use null for that field
- Confidence should reflect overall extraction quality`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Image,
                },
            },
        ]);

        const response = await result.response;
        const text = response.text();

        logger.info('Gemini API response received');

        // Parse the JSON response
        let extractedData: GeminiCheckData;
        try {
            // Remove markdown code blocks if present
            const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            extractedData = JSON.parse(jsonText);
        } catch (parseError) {
            logger.error({ error: parseError, rawText: text }, 'Failed to parse Gemini response as JSON');
            throw new AIError('Failed to parse Gemini response', parseError);
        }

        // Validate and normalize the data
        const normalizedData: GeminiCheckData = {
            payee: extractedData.payee || '',
            amount: typeof extractedData.amount === 'number' ? extractedData.amount : parseFloat(String(extractedData.amount)) || 0,
            date: extractedData.date || '',
            checkNumber: extractedData.checkNumber || '',
            bankName: extractedData.bankName || '',
            micrRouting: extractedData.micrRouting || undefined,
            micrAccount: extractedData.micrAccount || undefined,
            confidence: extractedData.confidence || 0.5,
        };

        logger.info({ data: normalizedData }, 'Check data extracted successfully');

        return normalizedData;
    } catch (error) {
        logger.error({ error }, 'Gemini API call failed');
        throw new AIError('Gemini API failed', error);
    }
}

export async function extractTextWithGemini(imageBuffer: Buffer): Promise<string> {
    try {
        logger.info('Calling Gemini 2.5 Flash API for text extraction');

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const base64Image = imageBuffer.toString('base64');

        const result = await model.generateContent([
            'Extract all text from this image. Return only the extracted text, preserving the layout as much as possible.',
            {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Image,
                },
            },
        ]);

        const response = await result.response;
        const text = response.text();

        logger.info('Text extraction completed');

        return text;
    } catch (error) {
        logger.error({ error }, 'Gemini text extraction failed');
        throw new AIError('Gemini text extraction failed', error);
    }
}
