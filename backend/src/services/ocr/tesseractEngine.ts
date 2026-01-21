import Tesseract from 'tesseract.js';
import logger from '../../utils/logger';
import { OCRError } from '../../utils/errors';

const OCR_LANGUAGE = process.env.OCR_LANGUAGE || 'eng';

export async function performOCR(imageBuffer: Buffer): Promise<Tesseract.Page> {
    try {
        logger.info('Starting Tesseract OCR');

        const worker = await Tesseract.createWorker(OCR_LANGUAGE);
        const { data } = await worker.recognize(imageBuffer);
        await worker.terminate();

        logger.info({
            confidence: data.confidence,
            textLength: data.text.length
        }, 'OCR completed');

        return data;
    } catch (error) {
        logger.error({ error }, 'OCR failed');
        throw new OCRError('Tesseract OCR failed', error);
    }
}