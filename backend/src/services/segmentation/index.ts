export * from './contourDetector';
export * from './aspectRatioFilter';

import { detectCheckBoundaries } from './contourDetector';
import { filterByAspectRatio } from './aspectRatioFilter';
import { CheckSegment } from '../../types/processing';

export async function segmentChecks(imageBuffer: Buffer): Promise<CheckSegment[]> {
    const rawSegments = await detectCheckBoundaries(imageBuffer);
    const validSegments = filterByAspectRatio(rawSegments);
    return validSegments;
}