import { GlassCard, Skeleton, SkeletonRows } from '@/components/ui';

/** Sidebar + table, the same footprint as the loaded dashboard body. */
export function DashboardBodySkeleton() {
  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-18rem)] lg:flex-row">
      <GlassCard padding="sm" className="space-y-3 lg:w-[22%] lg:min-w-[13rem]">
        <Skeleton shape="text" className="w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} shape="block" className="h-12 w-full" />
        ))}
      </GlassCard>
      <GlassCard padding="none" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-glass-hairline px-4 py-3">
          <Skeleton shape="heading" className="w-40" />
          <Skeleton shape="pill" className="w-24" />
        </div>
        <SkeletonRows rows={8} cols={6} />
      </GlassCard>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-5" data-tone="brand">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton shape="heading" className="w-36" />
          <Skeleton shape="line" className="w-56" />
        </div>
        <Skeleton shape="pill" className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} shape="block" className="h-[5.5rem]" />
        ))}
      </div>
      <DashboardBodySkeleton />
    </div>
  );
}
