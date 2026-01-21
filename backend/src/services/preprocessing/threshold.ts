import sharp from 'sharp';
import logger from '../../utils/logger';

export async function applyAdaptiveThreshold(imageBuffer: Buffer): Promise<Buffer> {
    try {
        // Sharp doesn't have built-in adaptive threshold
        // Use a combination of normalize + threshold
        const thresholded = await sharp(imageBuffer)
            .normalize()
            .threshold(128) // Binary threshold
            .toBuffer();

        logger.debug('Adaptive threshold applied');
        return thresholded;
    } catch (error) {
        logger.error({ error }, 'Threshold application failed');
        throw error;
    }
}