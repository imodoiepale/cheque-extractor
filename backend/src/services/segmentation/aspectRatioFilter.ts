import { CheckSegment } from '../../types/processing';
import { CHECK_DIMENSIONS } from '../../utils/constants';
import logger from '../../utils/logger';

export function filterByAspectRatio(segments: CheckSegment[]): CheckSegment[] {
    const filtered = segments.filter((segment) => {
        const { aspectRatio, bbox } = segment;

        // Check meets size requirements
        if (bbox.width < CHECK_DIMENSIONS.MIN_WIDTH) return false;
        if (bbox.height < CHECK_DIMENSIONS.MIN_HEIGHT) return false;

        // Check meets aspect ratio requirements
        if (aspectRatio < CHECK_DIMENSIONS.MIN_ASPECT_RATIO) return false;
        if (aspectRatio > CHECK_DIMENSIONS.MAX_ASPECT_RATIO) return false;

        return true;
    });

    logger.info({
        original: segments.length,
        filtered: filtered.length
    }, 'Aspect ratio filtering completed');

    return filtered;
}