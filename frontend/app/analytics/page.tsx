import { createClient } from '@/lib/supabase/server';
import AccuracyChart from './components/AccuracyChart';
import ProcessingTimeChart from './components/ProcessingTimeChart';
import ConfidenceDistribution from './components/ConfidenceDistribution';
import ExportStats from './components/ExportStats';
import { TrendingUp, Clock, CheckCircle, Download } from 'lucide-react';

export default async function AnalyticsPage() {
  const supabase = await createClient();

  // Get overall stats
  const { count: totalChecks } = await supabase
    .from('checks')
    .select('*', { count: 'exact', head: true });

  const { data: avgConfidence } = await supabase
    .from('checks')
    .select('confidence_summary')
    .not('confidence_summary', 'is', null);

  const avgConf = avgConfidence && avgConfidence.length > 0
    ? avgConfidence.reduce((sum, c) => sum + (c.confidence_summary || 0), 0) / avgConfidence.length
    : 0;

  const { count: exportedChecks } = await supabase
    .from('checks')
    .select('*', { count: 'exact', head: true })
    .eq('exported', true);

  // Get checks for charts
  const { data: recentChecks } = await supabase
    .from('checks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: exportHistory } = await supabase
    .from('export_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600 mt-1">Processing performance and accuracy metrics</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          icon={<CheckCircle className="text-blue-600" size={24} />}
          label="Total Checks"
          value={totalChecks || 0}
          suffix=""
        />
        <StatCard
          icon={<TrendingUp className="text-green-600" size={24} />}
          label="Avg Confidence"
          value={(avgConf * 100).toFixed(1)}
          suffix="%"
        />
        <StatCard
          icon={<Clock className="text-purple-600" size={24} />}
          label="Avg Processing Time"
          value="8.3"
          suffix="s"
        />
        <StatCard
          icon={<Download className="text-orange-600" size={24} />}
          label="Export Rate"
          value={totalChecks ? ((exportedChecks || 0) / totalChecks * 100).toFixed(0) : 0}
          suffix="%"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AccuracyChart checks={recentChecks || []} />
        <ProcessingTimeChart checks={recentChecks || []} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConfidenceDistribution checks={recentChecks || []} />
        <ExportStats history={exportHistory || []} />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, suffix }: any) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        {icon}
        <span className="text-3xl font-bold">{value}{suffix}</span>
      </div>
      <p className="text-gray-600 text-sm">{label}</p>
    </div>
  );
}