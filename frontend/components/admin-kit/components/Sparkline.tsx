'use client';
import React from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: number[];
  color?: string;
  positive?: boolean;
  negative?: boolean;
}

export function Sparkline({ data, color, positive, negative }: SparklineProps) {
  const resolvedColor = color ?? (positive ? "#34d399" : negative ? "#f87171" : "#a78bfa");
  const chartData = data.map((v) => ({ v }));

  return (
    <ResponsiveContainer width={80} height={32}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={resolvedColor}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
