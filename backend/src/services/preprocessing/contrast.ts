import sharp from 'sharp';
import logger from '../../utils/logger';

export async function normalizeContrast(imageBuffer: Buffer): Promise<Buffer> {
    try {
        const normalized = await sharp(imageBuffer)
            .normalize() // Histogram normalization
            .linear(1.2, -(128 * 0.2)) // Increase contrast slightly
            .toBuffer();

        logger.debug('Contrast normalized');
        return normalized;
    } catch (error) {
        logger.error({ error }, 'Contrast normalization failed');
        throw error;
    }
}