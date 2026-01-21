import axios from 'axios';
import { qboOAuthClient } from './oauthClient';
import logger from '../../../utils/logger';

const QBO_API_BASE = process.env.QBO_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';

export async function checkForDuplicateInQBO(
    tenantId: string,
    realmId: string,
    checkNumber: string,
    amount: number,
    date: string
): Promise<boolean> {
    try {
        const accessToken = await qboOAuthClient.getValidAccessToken(tenantId);

        // Query QBO for existing checks
        const query = `SELECT * FROM Check WHERE DocNumber = '${checkNumber}' AND TxnDate = '${date}'`;

        const response = await axios.get(
            `${QBO_API_BASE}/v3/company/${realmId}/query`,
            {
                params: { query },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                },
            }
        );

        const existingChecks = response.data.QueryResponse?.Check || [];

        // Check if any existing check has same amount
        const duplicate = existingChecks.some((check: any) => {
            return Math.abs(check.TotalAmt - amount) < 0.01; // Allow for floating point precision
        });

        if (duplicate) {
            logger.warn({ checkNumber, amount, date }, 'Duplicate check found in QuickBooks');
        }

        return duplicate;
    } catch (error) {
        logger.error({ error }, 'Failed to check for duplicates in QuickBooks');
        return false; // Return false on error to allow export attempt
    }
}