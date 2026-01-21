import { ProcessingStage } from '../../types/processing';
import { PROCESSING_STAGES } from '../../utils/constants';
import { saveProcessingStage } from '../../database/queries';
import logger from '../../utils/logger';

export class StageManager {
    private stages: Map<string, ProcessingStage> = new Map();

    constructor(private checkId: string) {
        this.initializeStages();
    }

    private initializeStages() {
        Object.values(PROCESSING_STAGES).forEach((stage) => {
            this.stages.set(stage.name, {
                name: stage.name,
                order: stage.order,
                status: 'pending',
                progress: 0,
            });
        });
    }

    async startStage(stageName: string) {
        const stage = this.stages.get(stageName);
        if (!stage) return;

        stage.status = 'processing';
        stage.progress = 0;
        stage.startedAt = new Date();

        await saveProcessingStage(this.checkId, stage);
        logger.info({ checkId: this.checkId, stage: stageName }, 'Stage started');
    }

    async updateProgress(stageName: string, progress: number, data?: any) {
        const stage = this.stages.get(stageName);
        if (!stage) return;

        stage.progress = progress;
        if (data) {
            stage.data = { ...stage.data, ...data };
        }

        await saveProcessingStage(this.checkId, stage);
    }

    async completeStage(stageName: string, data?: any) {
        const stage = this.stages.get(stageName);
        if (!stage) return;

        stage.status = 'complete';
        stage.progress = 100;
        stage.completedAt = new Date();

        if (stage.startedAt) {
            stage.durationMs = stage.completedAt.getTime() - stage.startedAt.getTime();
        }

        if (data) {
            stage.data = { ...stage.data, ...data };
        }

        await saveProcessingStage(this.checkId, stage);
        logger.info({ checkId: this.checkId, stage: stageName, duration: stage.durationMs }, 'Stage completed');
    }

    async failStage(stageName: string, errorMessage: string) {
        const stage = this.stages.get(stageName);
        if (!stage) return;

        stage.status = 'error';
        stage.errorMessage = errorMessage;
        stage.completedAt = new Date();

        await saveProcessingStage(this.checkId, stage);
        logger.error({ checkId: this.checkId, stage: stageName, error: errorMessage }, 'Stage failed');
    }
}