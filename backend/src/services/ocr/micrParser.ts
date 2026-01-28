import { FieldExtraction } from '../../types/extraction';
import { isValidRoutingNumber } from '../../utils/helpers';
import logger from '../../utils/logger';

export function parseMICRLine(text: string): {
    routing: FieldExtraction;
    account: FieldExtraction;
    serial: FieldExtraction;
} | null {
    try {
        // MICR line format: ⑆routing⑆ ⑈account⑈ check_number⑆
        // Look for 9-digit routing number
        const routingMatch = text.match(/\d{9}/);

        if (!routingMatch) {
            logger.debug('No routing number found in MICR line');
            return null;
        }

        const routing = routingMatch[0];
        const routingConfidence = isValidRoutingNumber(routing) ? 0.95 : 0.70;

        // Extract account number (typically 4-17 digits)
        const accountMatch = text.match(/\d{4,17}/g);
        const account = accountMatch && accountMatch[1] ? accountMatch[1] : '';

        // Extract check serial number
        const serialMatch = text.match(/\d{4,10}/g);
        const serial = serialMatch && serialMatch[2] ? serialMatch[2] : '';

        logger.info({ routing, account, serial }, 'MICR line parsed');

        return {
            routing: {
                value: routing,
                confidence: routingConfidence,
                source: 'ocr',
            },
            account: {
                value: account,
                confidence: account ? 0.90 : 0.50,
                source: 'ocr',
            },
            serial: {
                value: serial,
                confidence: serial ? 0.85 : 0.50,
                source: 'ocr',
            },
        };
    } catch (error) {
        logger.error({ error }, 'MICR parsing failed');
        return null;
    }
}