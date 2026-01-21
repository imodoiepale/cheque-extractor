export const exportConfig = {
    // QuickBooks
    qbo: {
        clientId: process.env.QBO_CLIENT_ID!,
        clientSecret: process.env.QBO_CLIENT_SECRET!,
        environment: process.env.QBO_ENVIRONMENT || 'sandbox',
        redirectUri: process.env.QBO_REDIRECT_URI || 'http://localhost:3000/api/qbo/callback',
    },

    // CSV
    csv: {
        outputDir: process.env.CSV_OUTPUT_DIR || '/tmp',
        encoding: 'utf-8',
        delimiter: ',',
    },

    // Export limits
    maxBatchSize: 100,
    exportTimeout: 300000, // 5 minutes
};