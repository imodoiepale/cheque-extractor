import type { NextApiRequest, NextApiResponse } from 'next';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3090';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method === 'GET') {
      // Fetch integration status from backend
      const response = await fetch(`${API_BASE_URL}/api/settings/integrations`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch integration status');
      }

      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === 'PATCH') {
      // Update API keys
      const { geminiApiKey } = req.body;

      const response = await fetch(`${API_BASE_URL}/api/settings/integrations`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ geminiApiKey }),
      });

      if (!response.ok) {
        throw new Error('Failed to update API keys');
      }

      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Integration API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
