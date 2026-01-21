import { convertToGrayscale } from './grayscale';
import { reduceNoise } from './denoise';
import { normalizeContrast } from './contrast';
import { applyAdaptiveThreshold } from './threshold';
import { deskewImage } from './deskew';
import { ImageProcessingResult } from '../../types/processing';
import logger from '../../utils/logger';

export async function preprocessImage(
    originalImage: Buffer
): Promise<ImageProcessingResult> {
    const startTime = Date.now();
    const transformations: string[] = [];

    try {
        logger.info('Starting image preprocessing pipeline');

        // Step 1: Convert to grayscale
        let processedImage = await convertToGrayscale(originalImage);
        transformations.push('grayscale');

        // Step 2: Deskew
        processedImage = await deskewImage(processedImage);
        transformations.push('deskew');

        // Step 3: Noise reduction
        processedImage = await reduceNoise(processedImage);
        transformations.push('denoise');

        // Step 4: Contrast normalization
        processedImage = await normalizeContrast(processedImage);
        transformations.push('contrast');

        // Step 5: Adaptive threshold
        processedImage = await applyAdaptiveThreshold(processedImage);
        transformations.push('threshold');

        const duration = Date.now() - startTime;
        logger.info({ duration, transformations }, 'Preprocessing pipeline completed');

        return {
            originalImage,
            processedImage,
            transformations,
        };
    } catch (error) {
        logger.error({ error }, 'Preprocessing pipeline failed');
        throw error;
    }
}