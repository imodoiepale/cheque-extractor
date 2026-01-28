'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface Props {
  checks: any[];
}

export default function ConfidenceDistribution({ checks }: Props) {
  const distribution = checks.reduce(
    (acc, check) => {
      const confidence = check.confidence_summary || 0;
      
      if (confidence >= 0.9) {
        acc.high++;
      } else if (confidence >= 0.7) {
        acc.medium++;
      } else {
        acc.low++;
      }

      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  const data = [
    { name: 'High (≥90%)', value: distribution.high, color: '#10b981' },
    { name: 'Medium (70-89%)', value: distribution.medium, color: '#f59e0b' },
    { name: 'Low (<70%)', value: distribution.low, color: '#ef4444' },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="font-semibold mb-4">Confidence Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}