import dotenv from 'dotenv';
import express from 'express';
import { ProcessingOrchestrator } from './services/orchestration';
import { checkProcessingQueue, checkExportQueue } from './queue';
import logger from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Process check endpoint
app.post('/process/:checkId', async (req, res) => {
    try {
        const { checkId } = req.params;

        // Add to queue
        const job = await checkProcessingQueue.add({ checkId });

        res.json({
            success: true,
            jobId: job.id,
            message: 'Processing started'
        });
    } catch (error: any) {
        logger.error({ error }, 'Failed to queue check processing');
        res.status(500).json({ error: error.message });
    }
});

// Export checks endpoint
app.post('/export', async (req, res) => {
    try {
        const { tenantId, checkIds, realmId, exportType } = req.body;

        // Add to queue
        const job = await checkExportQueue.add({ tenantId, checkIds, realmId, exportType });

        res.json({
            success: true,
            jobId: job.id,
            message: 'Export started'
        });
    } catch (error: any) {
        logger.error({ error }, 'Failed to queue check export');
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Backend server started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await checkProcessingQueue.close();
    await checkExportQueue.close();
    process.exit(0);
});