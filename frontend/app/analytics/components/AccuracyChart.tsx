'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface Props {
  checks: any[];
}

export default function AccuracyChart({ checks }: Props) {
  // Group by date and calculate average confidence
  const data = checks.reduce((acc: any[], check) => {
    const date = format(new Date(check.created_at), 'MMM dd');
    const existing = acc.find(item => item.date === date);

    if (existing) {
      existing.total += check.confidence_summary || 0;
      existing.count += 1;
      existing.confidence = (existing.total / existing.count) * 100;
    } else {
      acc.push({
        date,
        total: check.confidence_summary || 0,
        count: 1,
        confidence: (check.confidence_summary || 0) * 100,
      });
    }

    return acc;
  }, []);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="font-semibold mb-4">Confidence Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data.slice(-30)}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={[0, 100]} />
          <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
          <Line 
            type="monotone" 
            dataKey="confidence" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={{ fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}