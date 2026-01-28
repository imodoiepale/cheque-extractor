'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface Props {
  checks: any[];
}

export default function ProcessingTimeChart({ checks }: Props) {
  // Calculate processing time for each check
  const data = checks
    .filter(check => check.processing_started_at && check.updated_at)
    .map(check => {
      const start = new Date(check.processing_started_at).getTime();
      const end = new Date(check.updated_at).getTime();
      const duration = (end - start) / 1000; // in seconds

      return {
        date: format(new Date(check.created_at), 'MMM dd'),
        time: Math.min(duration, 30), // Cap at 30s for chart readability
      };
    })
    .slice(-30);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="font-semibold mb-4">Processing Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value: number) => `${value.toFixed(1)}s`} />
          <Bar dataKey="time" fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}