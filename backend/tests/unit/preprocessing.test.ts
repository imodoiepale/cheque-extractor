import { convertToGrayscale } from '../../src/services/preprocessing/grayscale';
import { reduceNoise } from '../../src/services/preprocessing/denoise';
import { preprocessImage } from '../../src/services/preprocessing/pipeline';
import fs from 'fs';
import path from 'path';

describe('Image Preprocessing', () => {
    let testImageBuffer: Buffer;

    beforeAll(() => {
        const imagePath = path.join(__dirname, '../fixtures/sample-checks/check1.png');
        testImageBuffer = fs.readFileSync(imagePath);
    });

    test('should convert image to grayscale', async () => {
        const result = await convertToGrayscale(testImageBuffer);
        expect(result).toBeInstanceOf(Buffer);
        expect(result.length).toBeGreaterThan(0);
    });

    test('should reduce noise in image', async () => {
        const result = await reduceNoise(testImageBuffer);
        expect(result).toBeInstanceOf(Buffer);
    });

    test('should complete full preprocessing pipeline', async () => {
        const result = await preprocessImage(testImageBuffer);

        expect(result.originalImage).toBeInstanceOf(Buffer);
        expect(result.processedImage).toBeInstanceOf(Buffer);
        expect(result.transformations).toContain('grayscale');
        expect(result.transformations).toContain('denoise');
    });
});