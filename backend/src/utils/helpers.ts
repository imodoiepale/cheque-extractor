import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
    return uuidv4();
}

export function calculateConfidence(scores: number[]): number {
    if (scores.length === 0) return 0;
    const sum = scores.reduce((acc, score) => acc + score, 0);
    return sum / scores.length;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
}

export function parseAmount(amountStr: string): number {
    // Remove currency symbols, commas, spaces
    const cleaned = amountStr.replace(/[$,\s]/g, '');
    return parseFloat(cleaned);
}

export function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[0];
}

export function isValidRoutingNumber(routing: string): boolean {
    if (!/^\d{9}$/.test(routing)) return false;

    // ABA routing number checksum validation
    const digits = routing.split('').map(Number);
    const checksum = (
        3 * (digits[0] + digits[3] + digits[6]) +
        7 * (digits[1] + digits[4] + digits[7]) +
        (digits[2] + digits[5] + digits[8])
    ) % 10;

    return checksum === 0;
}