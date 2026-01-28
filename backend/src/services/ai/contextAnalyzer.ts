import logger from '../../utils/logger';

interface TextBlock {
    text: string;
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    confidence: number;
}

interface ContextAnalysis {
    relativePosition: 'top-left' | 'top-center' | 'top-right' | 'middle' | 'bottom';
    nearbyText: string[];
    fontSize: 'small' | 'medium' | 'large';
    textDensity: number;
    likelyFieldType: 'payee' | 'amount' | 'date' | 'check_number' | 'bank' | 'memo' | 'unknown';
}

export function analyzeTextContext(
    block: TextBlock,
    allBlocks: TextBlock[],
    imageWidth: number,
    imageHeight: number
): ContextAnalysis {
    try {
        const relativePosition = determineRelativePosition(block.boundingBox, imageWidth, imageHeight);
        const nearbyText = findNearbyText(block, allBlocks);
        const fontSize = estimateFontSize(block.boundingBox);
        const textDensity = calculateTextDensity(block, imageWidth, imageHeight);
        const likelyFieldType = inferFieldType(block, relativePosition, nearbyText);

        logger.debug({
            text: block.text.substring(0, 30),
            likelyFieldType
        }, 'Context analyzed');

        return {
            relativePosition,
            nearbyText,
            fontSize,
            textDensity,
            likelyFieldType,
        };
    } catch (error) {
        logger.error({ error }, 'Context analysis failed');
        return {
            relativePosition: 'middle',
            nearbyText: [],
            fontSize: 'medium',
            textDensity: 0,
            likelyFieldType: 'unknown',
        };
    }
}

function determineRelativePosition(
    bbox: TextBlock['boundingBox'],
    imageWidth: number,
    imageHeight: number
): ContextAnalysis['relativePosition'] {
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    const relativeX = centerX / imageWidth;
    const relativeY = centerY / imageHeight;

    // Top third
    if (relativeY < 0.33) {
        if (relativeX < 0.33) return 'top-left';
        if (relativeX > 0.66) return 'top-right';
        return 'top-center';
    }

    // Bottom third
    if (relativeY > 0.66) {
        return 'bottom';
    }

    // Middle
    return 'middle';
}

function findNearbyText(target: TextBlock, allBlocks: TextBlock[]): string[] {
    const nearby: string[] = [];
    const threshold = 100; // pixels

    for (const block of allBlocks) {
        if (block === target) continue;

        const distance = calculateDistance(target.boundingBox, block.boundingBox);

        if (distance < threshold) {
            nearby.push(block.text);
        }
    }

    return nearby.slice(0, 5); // Return top 5 nearby texts
}

function calculateDistance(
    bbox1: TextBlock['boundingBox'],
    bbox2: TextBlock['boundingBox']
): number {
    const center1X = bbox1.x + bbox1.width / 2;
    const center1Y = bbox1.y + bbox1.height / 2;
    const center2X = bbox2.x + bbox2.width / 2;
    const center2Y = bbox2.y + bbox2.height / 2;

    return Math.sqrt(
        Math.pow(center2X - center1X, 2) + Math.pow(center2Y - center1Y, 2)
    );
}

function estimateFontSize(bbox: TextBlock['boundingBox']): 'small' | 'medium' | 'large' {
    const height = bbox.height;

    if (height < 15) return 'small';
    if (height > 30) return 'large';
    return 'medium';
}

function calculateTextDensity(
    block: TextBlock,
    imageWidth: number,
    imageHeight: number
): number {
    const blockArea = block.boundingBox.width * block.boundingBox.height;
    const imageArea = imageWidth * imageHeight;

    return blockArea / imageArea;
}

function inferFieldType(
    block: TextBlock,
    position: ContextAnalysis['relativePosition'],
    nearbyText: string[]
): ContextAnalysis['likelyFieldType'] {
    const text = block.text.toLowerCase();

    // Amount detection (currency symbols, decimal points)
    if (/\$|€|£/.test(text) || /\d+\.\d{2}/.test(text)) {
        return 'amount';
    }

    // Date detection
    if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text) ||
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text)) {
        return 'date';
    }

    // Check number (usually top-right, 4-6 digits)
    if (position === 'top-right' && /^\d{4,6}$/.test(text)) {
        return 'check_number';
    }

    // Bank name (usually top-center, contains bank keywords)
    if (position === 'top-center' &&
        /(bank|credit union|federal|trust)/i.test(text)) {
        return 'bank';
    }

    // Payee (usually left side, medium-large font, near "pay to" text)
    if (position === 'top-left' &&
        nearbyText.some(t => /pay.*to/i.test(t))) {
        return 'payee';
    }

    // Memo (usually bottom, near "memo" or "for" keywords)
    if (position === 'bottom' &&
        nearbyText.some(t => /memo|for/i.test(t))) {
        return 'memo';
    }

    return 'unknown';
}

export function crossValidateFields(fields: Record<string, any>): {
    valid: boolean;
    issues: string[];
} {
    const issues: string[] = [];

    // Check if numeric amount matches written amount
    if (fields.amount && fields.amountWritten) {
        // This would need a number-to-words library for full validation
        // For now, just check they both exist
        if (!fields.amount && !fields.amountWritten) {
            issues.push('Amount mismatch or missing');
        }
    }

    // Check if check number appears in MICR line
    if (fields.checkNumber && fields.micr?.serial) {
        if (fields.checkNumber !== fields.micr.serial) {
            issues.push('Check number does not match MICR serial');
        }
    }

    // Check if date is reasonable (not too far in past or future)
    if (fields.date) {
        const date = new Date(fields.date);
        const now = new Date();
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        const oneMonthAhead = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

        if (date < oneYearAgo || date > oneMonthAhead) {
            issues.push('Check date is outside reasonable range');
        }
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}