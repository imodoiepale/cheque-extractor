import sharp from 'sharp';
import logger from '../../utils/logger';

export async function reduceNoise(imageBuffer: Buffer): Promise<Buffer> {
    try {
        // Apply median blur for noise reduction
        const denoised = await sharp(imageBuffer)
            .median(3) // 3x3 median filter
            .toBuffer();

        logger.debug('Noise reduction applied');
        return denoised;
    } catch (error) {
        logger.error({ error }, 'Noise reduction failed');
        throw error;
    }
}