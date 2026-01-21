import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';
import path from 'path';
import { QBOCheckData } from '../../../types/export';
import { formatForQBOCSV } from './qboFormatter';
import logger from '../../../utils/logger';
import { generateId } from '../../../utils/helpers';

export async function generateQBOCSV(
    checks: QBOCheckData[],
    outputDir: string = '/tmp'
): Promise<{ filePath: string; fileName: string }> {
    try {
        const rows = formatForQBOCSV(checks);
        const csv = stringify(rows);

        const fileName = `qbo_export_${generateId()}.csv`;
        const filePath = path.join(outputDir, fileName);

        await fs.writeFile(filePath, csv, 'utf-8');

        logger.info({ filePath, count: checks.length }, 'CSV file generated');

        return { filePath, fileName };
    } catch (error) {
        logger.error({ error }, 'Failed to generate CSV');
        throw error;
    }
}