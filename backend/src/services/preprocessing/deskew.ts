import sharp from 'sharp';
import logger from '../../utils/logger';

export async function deskewImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
        // Simple deskew using Sharp's rotate with auto-detection
        // For advanced deskew, would need OpenCV or custom implementation

        const metadata = await sharp(imageBuffer).metadata();

        // For now, return as-is
        // In production, implement Hough transform-based deskewing
        logger.debug('Deskew check performed (placeholder)');

        return imageBuffer;
    } catch (error) {
        logger.error({ error }, 'Deskewing failed');
        throw error;
    }
}