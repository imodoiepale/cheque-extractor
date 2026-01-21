import Queue from 'bull';
import Redis from 'ioredis';
import logger from '../utils/logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL);

export const checkProcessingQueue = new Queue('check-processing', REDIS_URL);
export const checkExportQueue = new Queue('check-export', REDIS_URL);

logger.info('Queue workers initialized');