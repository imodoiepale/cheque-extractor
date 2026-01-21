import sharp from 'sharp';
import logger from '../../utils/logger';

export async function convertToGrayscale(imageBuffer: Buffer): Promise<Buffer> {
    try {
        const grayscale = await sharp(imageBuffer)
            .grayscale()
            .toBuffer();

        logger.debug('Image converted to grayscale');
        return grayscale;
    } catch (error) {
        logger.error({ error }, 'Grayscale conversion failed');
        throw error;
    }
}