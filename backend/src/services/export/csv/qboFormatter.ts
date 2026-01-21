import { QBOCheckData } from '../../../types/export';

export function formatForQBOCSV(checks: QBOCheckData[]): string[][] {
    const headers = [
        'Date',
        'Payee',
        'Amount',
        'Check Number',
        'Bank Account',
        'Memo',
    ];

    const rows = checks.map((check) => [
        check.txnDate,
        check.payee,
        check.amount.toFixed(2),
        check.checkNumber,
        check.bankAccount,
        check.memo || '',
    ]);

    return [headers, ...rows];
}