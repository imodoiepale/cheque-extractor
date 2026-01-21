import axios from 'axios';
import logger from '../../utils/logger';
import { AIError } from '../../utils/errors';

const VISION_API_KEY = process.env.VISION_API_KEY!;
const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

interface VisionResponse {
    responses: Array<{
        fullTextAnnotation?: {
            text: string;
        };
        textAnnotations?: Array<{
            description: string;
            boundingPoly: any;
        }>;
    }>;
}

export async function analyzeImageWithVision(imageBuffer: Buffer): Promise<VisionResponse> {
    try {
        logger.info('Calling Google Vision API');

        const base64Image = imageBuffer.toString('base64');

        const response = await axios.post<VisionResponse>(
            `${VISION_API_URL}?key=${VISION_API_KEY}`,
            {
                requests: [
                    {
                        image: {
                            content: base64Image,
                        },
                        features: [
                            { type: 'DOCUMENT_TEXT_DETECTION' },
                            { type: 'TEXT_DETECTION' },
                        ],
                    },
                ],
            }
        );

        logger.info('Vision API response received');

        return response.data;
    } catch (error) {
        logger.error({ error }, 'Vision API call failed');
        throw new AIError('Google Vision API failed', error);
    }
}