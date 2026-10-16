import { GlassCard, Skeleton, SkeletonText } from '@/components/ui';

/** Header + image/comparison column + field editor column, as the loaded page. */
export default function ReviewLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6" data-tone="brand">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton shape="heading" className="h-8 w-52" />
          <Skeleton shape="line" className="w-28" />
        </div>
        <div className="flex gap-2">
          <Skeleton shape="pill" className="h-10 w-24" />
          <Skeleton shape="pill" className="h-10 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <GlassCard padding="md"><Skeleton shape="block" className="aspect-[2.2/1] w-full" /></GlassCard>
          <GlassCard padding="md" className="space-y-3">
            <Skeleton shape="heading" className="w-40" />
            <SkeletonText lines={4} />
          </GlassCard>
        </div>
        <GlassCard padding="lg" className="space-y-5">
          <Skeleton shape="heading" className="w-36" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton shape="line" className="w-24" />
              <Skeleton shape="block" className="h-11 w-full" />
            </div>
          ))}
          <Skeleton shape="pill" className="h-12 w-full" />
        </GlassCard>
      </div>
    </div>
  );
}
