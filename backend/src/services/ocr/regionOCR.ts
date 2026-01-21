import sharp from 'sharp';
import { performOCR } from './tesseractEngine';
import logger from '../../utils/logger';

interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
}

interface RegionOCRResult {
    region: string;
    text: string;
    confidence: number;
}

export async function performRegionOCR(
    imageBuffer: Buffer,
    regions: Region[]
): Promise<RegionOCRResult[]> {
    try {
        logger.info({ regionCount: regions.length }, 'Starting region-based OCR');

        const results: RegionOCRResult[] = [];

        for (const region of regions) {
            const regionBuffer = await extractRegion(imageBuffer, region);
            const ocrResult = await performOCR(regionBuffer);

            results.push({
                region: region.name,
                text: ocrResult.text,
                confidence: ocrResult.confidence,
            });

            logger.debug({ region: region.name, confidence: ocrResult.confidence }, 'Region OCR completed');
        }

        logger.info({ resultsCount: results.length }, 'All region OCR completed');

        return results;
    } catch (error) {
        logger.error({ error }, 'Region OCR failed');
        throw error;
    }
}

async function extractRegion(imageBuffer: Buffer, region: Region): Promise<Buffer> {
    try {
        const extracted = await sharp(imageBuffer)
            .extract({
                left: region.x,
                top: region.y,
                width: region.width,
                height: region.height,
            })
            .toBuffer();

        return extracted;
    } catch (error) {
        logger.error({ error, region: region.name }, 'Failed to extract region');
        throw error;
    }
}

export async function performMICROCR(imageBuffer: Buffer): Promise<string> {
    try {
        logger.info('Performing MICR-specific OCR');

        // Get image dimensions
        const metadata = await sharp(imageBuffer).metadata();
        const height = metadata.height || 0;

        // MICR line is typically in bottom 15% of check
        const micrRegion: Region = {
            x: 0,
            y: Math.floor(height * 0.85),
            width: metadata.width || 0,
            height: Math.floor(height * 0.15),
            name: 'micr',
        };

        const micrBuffer = await extractRegion(imageBuffer, micrRegion);

        // Apply preprocessing specific to MICR
        const processed = await preprocessMICR(micrBuffer);

        const ocrResult = await performOCR(processed);

        logger.info({ text: ocrResult.text.substring(0, 50) }, 'MICR OCR completed');

        return ocrResult.text;
    } catch (error) {
        logger.error({ error }, 'MICR OCR failed');
        return '';
    }
}

async function preprocessMICR(imageBuffer: Buffer): Promise<Buffer> {
    // MICR-specific preprocessing
    return await sharp(imageBuffer)
        .threshold(128) // Binary threshold
        .negate() // Invert if needed
        .toBuffer();
}

export function defineStandardCheckRegions(
    imageWidth: number,
    imageHeight: number
): Region[] {
    return [
        {
            name: 'payee',
            x: 0,
            y: Math.floor(imageHeight * 0.25),
            width: Math.floor(imageWidth * 0.6),
            height: Math.floor(imageHeight * 0.15),
        },
        {
            name: 'amount_numeric',
            x: Math.floor(imageWidth * 0.65),
            y: Math.floor(imageHeight * 0.25),
            width: Math.floor(imageWidth * 0.3),
            height: Math.floor(imageHeight * 0.1),
        },
        {
            name: 'amount_written',
            x: 0,
            y: Math.floor(imageHeight * 0.4),
            width: Math.floor(imageWidth * 0.6),
            height: Math.floor(imageHeight * 0.1),
        },
        {
            name: 'date',
            x: Math.floor(imageWidth * 0.65),
            y: Math.floor(imageHeight * 0.1),
            width: Math.floor(imageWidth * 0.3),
            height: Math.floor(imageHeight * 0.1),
        },
        {
            name: 'check_number',
            x: Math.floor(imageWidth * 0.8),
            y: 0,
            width: Math.floor(imageWidth * 0.2),
            height: Math.floor(imageHeight * 0.1),
        },
        {
            name: 'micr',
            x: 0,
            y: Math.floor(imageHeight * 0.85),
            width: imageWidth,
            height: Math.floor(imageHeight * 0.15),
        },
    ];
}