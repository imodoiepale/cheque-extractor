import { EventEmitter } from 'events';
import logger from '../../utils/logger';

export interface ProcessingEvent {
    checkId: string;
    stage?: string;
    status?: string;
    progress?: number;
    data?: any;
    error?: string;
}

class ProcessingEventEmitter extends EventEmitter {
    emitStageUpdate(event: ProcessingEvent) {
        logger.debug({ event }, 'Stage update event');
        this.emit('stage_update', event);
    }

    emitProcessingComplete(event: ProcessingEvent) {
        logger.info({ event }, 'Processing complete event');
        this.emit('processing_complete', event);
    }

    emitProcessingError(event: ProcessingEvent) {
        logger.error({ event }, 'Processing error event');
        this.emit('processing_error', event);
    }
}

export const processingEmitter = new ProcessingEventEmitter();