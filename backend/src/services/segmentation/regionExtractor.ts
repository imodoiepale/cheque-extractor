import sharp from 'sharp';
import logger from '../../utils/logger';

export interface ROI {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export async function extractRegionsOfInterest(
    imageBuffer: Buffer,
    regions: ROI[]
): Promise<Map<string, Buffer>> {
    try {
        logger.info({ regionCount: regions.length }, 'Extracting regions of interest');

        const extractedRegions = new Map<string, Buffer>();

        for (const region of regions) {
            const regionBuffer = await extractROI(imageBuffer, region);
            extractedRegions.set(region.name, regionBuffer);

            logger.debug({ region: region.name }, 'ROI extracted');
        }

        logger.info({ count: extractedRegions.size }, 'All ROIs extracted');

        return extractedRegions;
    } catch (error) {
        logger.error({ error }, 'Failed to extract ROIs');
        throw error;
    }
}

async function extractROI(imageBuffer: Buffer, roi: ROI): Promise<Buffer> {
    try {
        const extracted = await sharp(imageBuffer)
            .extract({
                left: Math.max(0, Math.floor(roi.x)),
                top: Math.max(0, Math.floor(roi.y)),
                width: Math.floor(roi.width),
                height: Math.floor(roi.height),
            })
            .toBuffer();

        return extracted;
    } catch (error) {
        logger.error({ error, roi: roi.name }, 'Failed to extract ROI');
        throw error;
    }
}

export function defineCheckROIs(imageWidth: number, imageHeight: number): ROI[] {
    return [
        {
            name: 'top_section',
            x: 0,
            y: 0,
            width: imageWidth,
            height: Math.floor(imageHeight * 0.33),
        },
        {
            name: 'middle_section',
            x: 0,
            y: Math.floor(imageHeight * 0.33),
            width: imageWidth,
            height: Math.floor(imageHeight * 0.34),
        },
        {
            name: 'bottom_section',
            x: 0,
            y: Math.floor(imageHeight * 0.67),
            width: imageWidth,
            height: Math.floor(imageHeight * 0.33),
        },
        {
            name: 'payee_region',
            x: Math.floor(imageWidth * 0.05),
            y: Math.floor(imageHeight * 0.25),
            width: Math.floor(imageWidth * 0.55),
            height: Math.floor(imageHeight * 0.15),
        },
        {
            name: 'amount_region',
            x: Math.floor(imageWidth * 0.65),
            y: Math.floor(imageHeight * 0.25),
            width: Math.floor(imageWidth * 0.30),
            height: Math.floor(imageHeight * 0.12),
        },
        {
            name: 'date_region',
            x: Math.floor(imageWidth * 0.65),
            y: Math.floor(imageHeight * 0.08),
            width: Math.floor(imageWidth * 0.30),
            height: Math.floor(imageHeight * 0.10),
        },
        {
            name: 'check_number_region',
            x: Math.floor(imageWidth * 0.80),
            y: 0,
            width: Math.floor(imageWidth * 0.20),
            height: Math.floor(imageHeight * 0.08),
        },
        {
            name: 'micr_region',
            x: 0,
            y: Math.floor(imageHeight * 0.88),
            width: imageWidth,
            height: Math.floor(imageHeight * 0.12),
        },
        {
            name: 'signature_region',
            x: Math.floor(imageWidth * 0.50),
            y: Math.floor(imageHeight * 0.60),
            width: Math.floor(imageWidth * 0.45),
            height: Math.floor(imageHeight * 0.20),
        },
    ];
}

export async function enhanceROI(roiBuffer: Buffer, roiName: string): Promise<Buffer> {
    try {
        // Apply region-specific enhancements
        let enhanced = roiBuffer;

        switch (roiName) {
            case 'micr_region':
                // High contrast for MICR
                enhanced = await sharp(roiBuffer)
                    .threshold(120)
                    .negate()
                    .toBuffer();
                break;

            case 'amount_region':
            case 'check_number_region':
                // Enhance for numeric characters
                enhanced = await sharp(roiBuffer)
                    .sharpen()
                    .normalize()
                    .toBuffer();
                break;

            case 'signature_region':
                // Enhance for handwriting
                enhanced = await sharp(roiBuffer)
                    .normalize()
                    .linear(1.5, -(128 * 0.5))
                    .toBuffer();
                break;

            default:
                // Standard enhancement
                enhanced = await sharp(roiBuffer)
                    .normalize()
                    .toBuffer();
        }

        return enhanced;
    } catch (error) {
        logger.error({ error, roiName }, 'Failed to enhance ROI');
        return roiBuffer; // Return original on error
    }
}