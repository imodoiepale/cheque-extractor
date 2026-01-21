import sharp from 'sharp';
import { CheckSegment } from '../../types/processing';
import logger from '../../utils/logger';

export async function splitMultipleChecks(
    imageBuffer: Buffer,
    segments: CheckSegment[]
): Promise<CheckSegment[]> {
    try {
        logger.info({ segmentCount: segments.length }, 'Splitting multiple checks');

        const splitChecks: CheckSegment[] = [];

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];

            // Extract individual check image
            const checkImage = await extractCheckImage(imageBuffer, segment.bbox);

            splitChecks.push({
                ...segment,
                index: i,
                image: checkImage,
            });

            logger.debug({ index: i, bbox: segment.bbox }, 'Check extracted');
        }

        logger.info({ checkCount: splitChecks.length }, 'Multiple checks split successfully');

        return splitChecks;
    } catch (error) {
        logger.error({ error }, 'Failed to split multiple checks');
        throw error;
    }
}

async function extractCheckImage(
    imageBuffer: Buffer,
    bbox: CheckSegment['bbox']
): Promise<Buffer> {
    try {
        const extracted = await sharp(imageBuffer)
            .extract({
                left: Math.floor(bbox.x),
                top: Math.floor(bbox.y),
                width: Math.floor(bbox.width),
                height: Math.floor(bbox.height),
            })
            .toBuffer();

        return extracted;
    } catch (error) {
        logger.error({ error, bbox }, 'Failed to extract check image');
        throw error;
    }
}

export function mergeOverlappingSegments(segments: CheckSegment[]): CheckSegment[] {
    if (segments.length <= 1) return segments;

    const merged: CheckSegment[] = [];
    const sorted = [...segments].sort((a, b) => a.bbox.y - b.bbox.y);

    let current = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        const next = sorted[i];

        if (isOverlapping(current.bbox, next.bbox)) {
            // Merge bounding boxes
            current = {
                ...current,
                bbox: mergeBoundingBoxes(current.bbox, next.bbox),
                area: current.area + next.area,
            };
        } else {
            merged.push(current);
            current = next;
        }
    }

    merged.push(current);

    logger.info({
        original: segments.length,
        merged: merged.length
    }, 'Segments merged');

    return merged;
}

function isOverlapping(
    bbox1: CheckSegment['bbox'],
    bbox2: CheckSegment['bbox']
): boolean {
    const overlap = !(
        bbox1.x + bbox1.width < bbox2.x ||
        bbox2.x + bbox2.width < bbox1.x ||
        bbox1.y + bbox1.height < bbox2.y ||
        bbox2.y + bbox2.height < bbox1.y
    );

    return overlap;
}

function mergeBoundingBoxes(
    bbox1: CheckSegment['bbox'],
    bbox2: CheckSegment['bbox']
): CheckSegment['bbox'] {
    const x = Math.min(bbox1.x, bbox2.x);
    const y = Math.min(bbox1.y, bbox2.y);
    const maxX = Math.max(bbox1.x + bbox1.width, bbox2.x + bbox2.width);
    const maxY = Math.max(bbox1.y + bbox1.height, bbox2.y + bbox2.height);

    return {
        x,
        y,
        width: maxX - x,
        height: maxY - y,
    };
}

export function sortChecksByPosition(segments: CheckSegment[]): CheckSegment[] {
    // Sort top-to-bottom, left-to-right
    return [...segments].sort((a, b) => {
        // First by Y position (top to bottom)
        if (Math.abs(a.bbox.y - b.bbox.y) > 50) {
            return a.bbox.y - b.bbox.y;
        }
        // Then by X position (left to right)
        return a.bbox.x - b.bbox.x;
    });
}