import { EventEmitter } from 'events';
import { StageManager } from './stageManager';
import { processingEmitter } from './eventEmitter';
import { getCheckById, updateCheckStatus, updateCheckFields, createAuditLog } from '../../database/queries';
import { downloadFromUrl } from '../ingestion/fileHandler';
import { preprocessImage } from '../preprocessing';
import { segmentChecks } from '../segmentation';
import { extractWithOCR } from '../ocr';
import { extractWithAI } from '../ai';
import { selectBestFields } from '../hybrid';
import { validateCheck } from '../validation';
import { PROCESSING_STAGES, CHECK_STATUS } from '../../utils/constants';
import logger from '../../utils/logger';
import { ProcessingError } from '../../utils/errors';

export class ProcessingOrchestrator extends EventEmitter {
    private stageManager: StageManager;

    constructor(private checkId: string) {
        super();
        this.stageManager = new StageManager(checkId);
    }

    async execute() {
        const startTime = Date.now();

        try {
            logger.info({ checkId: this.checkId }, 'Starting check processing pipeline');

            // Update check status
            await updateCheckStatus(this.checkId, CHECK_STATUS.PROCESSING);

            // Load check record
            const check = await getCheckById(this.checkId);

            // Stage 1: Ingestion (already complete)
            await this.stageManager.completeStage(PROCESSING_STAGES.INGESTION.name, {
                fileUrl: check.file_url,
                fileType: check.file_type,
            });

            // Stage 2: Preprocessing
            await this.stageManager.startStage(PROCESSING_STAGES.PREPROCESSING.name);
            const imageBuffer = await downloadFromUrl(check.file_url);
            const preprocessed = await preprocessImage(imageBuffer);
            await this.stageManager.completeStage(PROCESSING_STAGES.PREPROCESSING.name, {
                transformations: preprocessed.transformations,
            });

            // Stage 3: Segmentation
            await this.stageManager.startStage(PROCESSING_STAGES.SEGMENTATION.name);
            const segments = await segmentChecks(preprocessed.processedImage);
            await this.stageManager.completeStage(PROCESSING_STAGES.SEGMENTATION.name, {
                segmentCount: segments.length,
                bboxes: segments.map(s => s.bbox),
            });

            if (segments.length === 0) {
                throw new ProcessingError('No valid check segments found', 'NO_SEGMENTS_FOUND');
            }

            // Use first segment (for multi-check support, would loop here)
            const checkImage = segments[0].image;

            // Stage 4 & 5: Parallel extraction (OCR + AI)
            await this.stageManager.startStage(PROCESSING_STAGES.OCR_EXTRACTION.name);
            await this.stageManager.startStage(PROCESSING_STAGES.AI_EXTRACTION.name);

            const [ocrFields, aiFields] = await Promise.all([
                extractWithOCR(checkImage),
                extractWithAI(checkImage),
            ]);

            await this.stageManager.completeStage(PROCESSING_STAGES.OCR_EXTRACTION.name, {
                fields: ocrFields,
            });

            await this.stageManager.completeStage(PROCESSING_STAGES.AI_EXTRACTION.name, {
                fields: aiFields,
            });

            // Stage 6: Hybrid selection
            await this.stageManager.startStage(PROCESSING_STAGES.HYBRID_SELECTION.name);
            const selectedFields = selectBestFields(ocrFields, aiFields);
            await this.stageManager.completeStage(PROCESSING_STAGES.HYBRID_SELECTION.name, {
                selectedFields,
            });

            // Stage 7: Validation
            await this.stageManager.startStage(PROCESSING_STAGES.VALIDATION.name);
            const validation = await validateCheck(check.tenant_id, selectedFields);
            await this.stageManager.completeStage(PROCESSING_STAGES.VALIDATION.name, {
                validation,
            });

            // Save extracted fields to database
            await updateCheckFields(this.checkId, selectedFields, validation);

            // Update processing timing
            const duration = Date.now() - startTime;
            await updateCheckStatus(this.checkId, validation.recommendedStatus);

            // Create audit log
            await createAuditLog(this.checkId, check.tenant_id, 'processed', {
                fields: selectedFields,
                validation,
                duration,
            });

            // Stage 8: Complete
            await this.stageManager.completeStage(PROCESSING_STAGES.COMPLETE.name, {
                status: validation.recommendedStatus,
                confidenceSummary: validation.confidenceSummary,
                duration,
            });

            processingEmitter.emitProcessingComplete({
                checkId: this.checkId,
                status: validation.recommendedStatus,
                data: { fields: selectedFields, validation },
            });

            logger.info({
                checkId: this.checkId,
                duration,
                status: validation.recommendedStatus
            }, 'Processing pipeline completed successfully');

            return {
                checkId: this.checkId,
                status: validation.recommendedStatus,
                fields: selectedFields,
                validation,
                duration,
            };

        } catch (error: any) {
            logger.error({ error, checkId: this.checkId }, 'Processing pipeline failed');

            // Mark current stage as failed
            const currentStage = Object.values(PROCESSING_STAGES).find(
                s => s.order > 0 // Find first non-complete stage
            );

            if (currentStage) {
                await this.stageManager.failStage(currentStage.name, error.message);
            }

            // Update check status to error
            await updateCheckStatus(this.checkId, 'error');

            processingEmitter.emitProcessingError({
                checkId: this.checkId,
                error: error.message,
            });

            throw error;
        }
    }
}