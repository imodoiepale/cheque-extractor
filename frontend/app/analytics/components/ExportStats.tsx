'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';

interface Props {
  history: any[];
}

export default function ExportStats({ history }: Props) {
  const data = history.map(record => ({
    date: format(new Date(record.created_at), 'MMM dd'),
    successful: record.successful_count,
    failed: record.failed_count,
  })).reverse();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="font-semibold mb-4">Export Success Rate</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="successful" fill="#10b981" name="Successful" />
          <Bar dataKey="failed" fill="#ef4444" name="Failed" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}