import sharp from 'sharp';
import fs from 'fs/promises';
import logger from '../../utils/logger';
import { ProcessingError } from '../../utils/errors';

export async function loadImageFromPath(filePath: string): Promise<Buffer> {
    try {
        logger.info({ filePath }, 'Loading image from path');

        const imageBuffer = await fs.readFile(filePath);

        // Validate it's a valid image
        const metadata = await sharp(imageBuffer).metadata();

        if (!metadata.width || !metadata.height) {
            throw new ProcessingError('Invalid image file', 'INVALID_IMAGE');
        }

        logger.info({
            width: metadata.width,
            height: metadata.height,
            format: metadata.format
        }, 'Image loaded successfully');

        return imageBuffer;
    } catch (error) {
        logger.error({ error, filePath }, 'Failed to load image');
        throw error;
    }
}

export async function loadImageFromURL(url: string): Promise<Buffer> {
    try {
        logger.info({ url }, 'Loading image from URL');

        const response = await fetch(url);

        if (!response.ok) {
            throw new ProcessingError(
                `Failed to fetch image: ${response.statusText}`,
                'IMAGE_FETCH_ERROR',
                response.status
            );
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Validate image
        const metadata = await sharp(buffer).metadata();

        if (!metadata.width || !metadata.height) {
            throw new ProcessingError('Invalid image from URL', 'INVALID_IMAGE');
        }

        logger.info({
            width: metadata.width,
            height: metadata.height
        }, 'Image loaded from URL successfully');

        return buffer;
    } catch (error) {
        logger.error({ error, url }, 'Failed to load image from URL');
        throw error;
    }
}

export async function loadImageFromBase64(base64Data: string): Promise<Buffer> {
    try {
        logger.info('Loading image from base64');

        // Remove data URI prefix if present
        const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');

        const buffer = Buffer.from(base64Clean, 'base64');

        // Validate image
        const metadata = await sharp(buffer).metadata();

        if (!metadata.width || !metadata.height) {
            throw new ProcessingError('Invalid base64 image', 'INVALID_IMAGE');
        }

        logger.info({
            width: metadata.width,
            height: metadata.height
        }, 'Image loaded from base64 successfully');

        return buffer;
    } catch (error) {
        logger.error({ error }, 'Failed to load image from base64');
        throw error;
    }
}

export async function validateImageDimensions(
    imageBuffer: Buffer,
    minWidth: number = 500,
    minHeight: number = 200,
    maxWidth: number = 5000,
    maxHeight: number = 5000
): Promise<void> {
    const metadata = await sharp(imageBuffer).metadata();

    if (!metadata.width || !metadata.height) {
        throw new ProcessingError('Could not determine image dimensions', 'INVALID_IMAGE');
    }

    if (metadata.width < minWidth || metadata.height < minHeight) {
        throw new ProcessingError(
            `Image too small: ${metadata.width}x${metadata.height} (minimum: ${minWidth}x${minHeight})`,
            'IMAGE_TOO_SMALL'
        );
    }

    if (metadata.width > maxWidth || metadata.height > maxHeight) {
        throw new ProcessingError(
            `Image too large: ${metadata.width}x${metadata.height} (maximum: ${maxWidth}x${maxHeight})`,
            'IMAGE_TOO_LARGE'
        );
    }
}

export async function resizeIfNeeded(
    imageBuffer: Buffer,
    maxWidth: number = 3000,
    maxHeight: number = 3000
): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();

    if (!metadata.width || !metadata.height) {
        return imageBuffer;
    }

    if (metadata.width <= maxWidth && metadata.height <= maxHeight) {
        return imageBuffer;
    }

    logger.info({
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        maxWidth,
        maxHeight
    }, 'Resizing image');

    const resized = await sharp(imageBuffer)
        .resize(maxWidth, maxHeight, {
            fit: 'inside',
            withoutEnlargement: true,
        })
        .toBuffer();

    return resized;
}