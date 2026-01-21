export interface QBOCheckData {
    txnDate: string;
    payee: string;
    amount: number;
    checkNumber: string;
    bankAccount: string;
    memo?: string;
}

export interface ExportResult {
    success: boolean;
    checkId: string;
    transactionId?: string;
    errorMessage?: string;
    exportedAt: Date;
}

export interface BatchExportResult {
    batchId: string;
    totalChecks: number;
    successfulCount: number;
    failedCount: number;
    results: ExportResult[];
    exportType: 'qbo_api' | 'csv';
}