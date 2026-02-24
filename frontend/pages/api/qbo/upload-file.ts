import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { parseQBOFile, toQBEntries } from '../../../lib/utils/qboParser';

/**
 * QBO File Upload API
 *
 * Accepts .qbo, .ofx, .qfx file uploads, parses them,
 * and stores cheque transactions in the qb_entries table.
 *
 * POST /api/qbo/upload-file
 * Body: multipart/form-data with field "file"
 * Optional query: ?includeAll=true to import all transactions (not just cheques)
 */

export const config = {
  api: {
    bodyParser: false,
  },
};

async function parseMultipartBody(req: NextApiRequest): Promise<{ fileContent: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';

        if (contentType.includes('multipart/form-data')) {
          // Extract boundary
          const boundaryMatch = contentType.match(/boundary=(.+)/);
          if (!boundaryMatch) {
            reject(new Error('No boundary found in multipart request'));
            return;
          }
          const boundary = boundaryMatch[1].trim();
          const bodyStr = body.toString('utf-8');

          // Split by boundary
          const parts = bodyStr.split(`--${boundary}`);

          for (const part of parts) {
            if (part.includes('filename=')) {
              // Extract filename
              const filenameMatch = part.match(/filename="([^"]+)"/);
              const fileName = filenameMatch ? filenameMatch[1] : 'unknown.qbo';

              // Extract content (after double newline)
              const headerEnd = part.indexOf('\r\n\r\n');
              if (headerEnd === -1) {
                const altEnd = part.indexOf('\n\n');
                if (altEnd === -1) continue;
                const fileContent = part.substring(altEnd + 2).replace(/\r?\n--$/, '').trim();
                resolve({ fileContent, fileName });
                return;
              }
              const fileContent = part.substring(headerEnd + 4).replace(/\r?\n--$/, '').trim();
              resolve({ fileContent, fileName });
              return;
            }
          }
          reject(new Error('No file found in multipart body'));
        } else {
          // Plain text body — treat as raw file content
          resolve({ fileContent: body.toString('utf-8'), fileName: 'upload.qbo' });
        }
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isPreview = req.query.preview === 'true';

  try {
    // Parse the uploaded file
    const { fileContent, fileName } = await parseMultipartBody(req);

    if (!fileContent || fileContent.length < 10) {
      return res.status(400).json({ error: 'Empty or invalid file' });
    }

    // Validate file extension
    const ext = fileName.toLowerCase().split('.').pop();
    if (!['qbo', 'ofx', 'qfx'].includes(ext || '')) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: 'Please upload a .qbo, .ofx, or .qfx file',
      });
    }

    // Parse the QBO/OFX content
    const parseResult = parseQBOFile(fileContent);

    if (parseResult.errors.length > 0 && parseResult.allTransactions.length === 0) {
      return res.status(400).json({
        error: 'Failed to parse file',
        details: parseResult.errors,
      });
    }

    // Import all transactions by default (not just cheque-filtered ones)
    // User can see the preview and decide what to import
    const includeAll = req.query.includeAll !== 'false'; // Default to true
    const transactionsToImport = includeAll
      ? parseResult.allTransactions
      : parseResult.transactions;

    // Convert to qb_entries format
    const entries = toQBEntries(transactionsToImport);

    // If preview mode, return parsed data without storing
    if (isPreview) {
      return res.status(200).json({
        success: true,
        preview: transactionsToImport.map(t => ({
          checkNumber: t.checkNumber,
          date: t.date,
          amount: t.amount,
          payee: t.payee,
          memo: t.memo,
        })),
        totalTransactions: parseResult.allTransactions.length,
        chequeTransactions: parseResult.transactions.length,
      });
    }

    // Store in Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let storeError: string | null = null;
    if (entries.length > 0) {
      const { error } = await supabase
        .from('qb_entries')
        .upsert(
          entries.map(e => ({
            id: e.id,
            qb_type: e.qb_type,
            qb_source: e.qb_source,
            check_number: e.check_number,
            date: e.date,
            amount: e.amount,
            payee: e.payee,
            account: e.account,
            memo: e.memo,
            raw_data: e.raw_data,
            synced_at: e.synced_at,
          })),
          { onConflict: 'id' }
        );

      if (error) {
        storeError = error.message;
      }
    }

    return res.status(200).json({
      success: true,
      fileName,
      fileType: parseResult.fileType,
      accountId: parseResult.accountId,
      bankId: parseResult.bankId,
      dateRange: parseResult.dateRange,
      totalTransactions: parseResult.allTransactions.length,
      chequeTransactions: parseResult.transactions.length,
      imported: entries.length,
      storeError,
      parseErrors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
    });
  } catch (error: any) {
    console.error('QBO upload error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to process QBO file',
    });
  }
}
