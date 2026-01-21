import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { ProcessingError } from '../../utils/errors';
import logger from '../../utils/logger';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB
const SUPPORTED_FORMATS = (process.env.SUPPORTED_FORMATS || 'pdf,png,jpg,jpeg').split(',');

export async function validateFile(filePath: string, fileType: string): Promise<void> {
    // Check file exists
    try {
        await fs.access(filePath);
    } catch {
        throw new ProcessingError('File not found', 'FILE_NOT_FOUND', 404);
    }

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_FILE_SIZE) {
        throw new ProcessingError(
            `File size ${stats.size} exceeds maximum ${MAX_FILE_SIZE}`,
            'FILE_TOO_LARGE',
            400
        );
    }

    // Check file type
    const ext = fileType.toLowerCase().replace('.', '');
    if (!SUPPORTED_FORMATS.includes(ext)) {
        throw new ProcessingError(
            `File type ${fileType} not supported`,
            'UNSUPPORTED_FORMAT',
            400
        );
    }

    logger.info({ filePath, fileType, size: stats.size }, 'File validated');
}

export async function loadImage(filePath: string): Promise<Buffer> {
    try {
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.pdf') {
            // For PDF, we'd need pdf-parse or similar
            // For now, assume it's converted to image first
            throw new ProcessingError('PDF conversion not yet implemented', 'NOT_IMPLEMENTED');
        }

        // Load image
        const imageBuffer = await fs.readFile(filePath);

        // Validate it's actually an image
        const metadata = await sharp(imageBuffer).metadata();

        if (!metadata.width || !metadata.height) {
            throw new ProcessingError('Invalid image file', 'INVALID_IMAGE', 400);
        }

        logger.info({
            filePath,
            width: metadata.width,
            height: metadata.height,
            format: metadata.format
        }, 'Image loaded');

        return imageBuffer;
    } catch (error) {
        if (error instanceof ProcessingError) throw error;
        logger.error({ error, filePath }, 'Failed to load image');
        throw new ProcessingError('Failed to load image', 'IMAGE_LOAD_ERROR', 500, error);
    }
}

export async function downloadFromUrl(url: string): Promise<Buffer> {
    // Implementation depends on whether using Supabase Storage or external URL
    // For Supabase Storage, use signed URL and fetch

    const response = await fetch(url);
    if (!response.ok) {
        throw new ProcessingError('Failed to download file', 'DOWNLOAD_ERROR', 500);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}