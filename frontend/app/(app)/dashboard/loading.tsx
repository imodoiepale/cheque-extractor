import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-brand" />
        <p className="text-sm text-ink-body">Loading dashboard...</p>
      </div>
    </div>
  );
}
