import axios from 'axios';
import { QBOCheckData, ExportResult } from '../../../types/export';
import { qboOAuthClient } from './oauthClient';
import logger from '../../../utils/logger';

const QBO_API_BASE = process.env.QBO_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';

export async function createCheckInQBO(
    tenantId: string,
    realmId: string,
    checkData: QBOCheckData,
    checkId: string
): Promise<ExportResult> {
    try {
        logger.info({ checkId, tenantId }, 'Creating check in QuickBooks');

        // Get valid access token
        const accessToken = await qboOAuthClient.getValidAccessToken(tenantId);

        // Format check data for QBO API
        const qboPayload = {
            TxnDate: checkData.txnDate,
            Line: [
                {
                    Amount: checkData.amount,
                    DetailType: 'AccountBasedExpenseLineDetail',
                    AccountBasedExpenseLineDetail: {
                        AccountRef: {
                            value: checkData.bankAccount, // Bank account ID
                        },
                    },
                },
            ],
            EntityRef: {
                value: checkData.payee, // Vendor ID
            },
            DocNumber: checkData.checkNumber,
            PrivateNote: checkData.memo,
        };

        // Make API request
        const response = await axios.post(
            `${QBO_API_BASE}/v3/company/${realmId}/check`,
            qboPayload,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
            }
        );

        const transactionId = response.data.Check.Id;

        logger.info({ checkId, transactionId }, 'Check created in QuickBooks');

        return {
            success: true,
            checkId,
            transactionId,
            exportedAt: new Date(),
        };
    } catch (error: any) {
        logger.error({ error, checkId }, 'Failed to create check in QuickBooks');

        return {
            success: false,
            checkId,
            errorMessage: error.response?.data?.Fault?.Error?.[0]?.Message || error.message,
            exportedAt: new Date(),
        };
    }
}