'use client';
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { ChartCard } from "../components/ChartCard";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";
import { supabase } from "@/components/admin-kit/shim/supabase";
import { cn } from "@/lib/utils";

// Friendly labels for the heard_about channel ids (see HeardAboutModal / OnboardingSourceScreen).
const CHANNEL_LABELS: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  friend: "Friend or family",
  search: "Search engine",
  app_store: "App Store / Play Store",
  other: "Something else",
  unanswered: "Unanswered",
  // legacy ids from before the option list was revised
  social: "Social media (legacy)",
  instagram_tiktok: "Instagram/TikTok (legacy)",
  podcast_youtube: "Podcast/YouTube (legacy)",
};
const channelLabel = (id: string) =>
  CHANNEL_LABELS[id] ?? id.replace(/_/g, " ");

export default function GrowthPage() {
  const { data: pushData, isLoading: pushLoading } = useQuery({
    queryKey: ["admin", "growth", "push"],
    queryFn: async () => {
      const { count } = await supabase
        .from("push_subscriptions")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const { data: heardAboutData, isLoading: heardAboutLoading } = useQuery({
    queryKey: ["admin", "growth", "heard-about"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("heard_about");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const key =
          (row as { heard_about: string | null }).heard_about ?? "unanswered";
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return Object.entries(counts)
        .map(([channel, count]) => ({ channel, count }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 60_000,
  });

  const { data: feedbackData, isLoading: feedbackLoading } = useQuery({
    queryKey: ["admin", "growth", "feedback-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("rating, category, created_at")
        .not("rating", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const avgRating =
    feedbackData && feedbackData.length > 0
      ? (
          feedbackData.reduce((s, r) => s + (r.rating ?? 0), 0) /
          feedbackData.length
        ).toFixed(1)
      : null;

  const ratingDist = feedbackData
    ? [5, 4, 3, 2, 1].map((star) => ({
        star,
        count: feedbackData.filter((r) => r.rating === star).length,
      }))
    : [];
  const maxCount = Math.max(1, ...ratingDist.map((r) => r.count));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Growth"
        description="Push subscribers, ratings and user acquisition"
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] p-5">
          <p className="text-xs tracking-wider text-neutral-500 uppercase">
            Push Subscribers
          </p>
          {pushLoading ? (
            <Skeleton className="mt-2 h-8 w-20 bg-white/[0.06]" />
          ) : (
            <p className="mt-2 text-3xl font-bold text-white tabular-nums">
              {pushData?.toLocaleString()}
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-600">Opt-in to reminders</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] p-5">
          <p className="text-xs tracking-wider text-neutral-500 uppercase">
            Avg Rating
          </p>
          {feedbackLoading ? (
            <Skeleton className="mt-2 h-8 w-20 bg-white/[0.06]" />
          ) : (
            <p className="mt-2 text-3xl font-bold text-yellow-400 tabular-nums">
              {avgRating ? `${avgRating} ★` : "—"}
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-600">
            {feedbackData?.length ?? 0} rated submissions
          </p>
        </div>
      </div>

      {/* Rating distribution */}
      <ChartCard
        title="Rating Distribution"
        description="Star ratings from the Rate App screen"
        loading={feedbackLoading}
      >
        {!feedbackData?.length ? (
          <EmptyState
            title="No ratings yet"
            description="Submitted ratings will appear here."
          />
        ) : (
          <div className="space-y-3">
            {ratingDist.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-3">
                <span className="w-6 text-right text-sm text-neutral-400">
                  {star}★
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    className="h-full rounded-full bg-yellow-400/70"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-sm text-neutral-500 tabular-nums">
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      {/* Self-reported acquisition channel */}
      <ChartCard
        title="How Users Found Us"
        description="Self-reported acquisition channel (heard_about) — 'unanswered' users get the post-login popup"
        loading={heardAboutLoading}
      >
        {!heardAboutData?.length ? (
          <EmptyState
            title="No data yet"
            description="Answers from onboarding and the post-login popup will appear here."
          />
        ) : (
          <div className="space-y-3">
            {heardAboutData.map(({ channel, count }) => {
              const max = Math.max(1, ...heardAboutData.map((r) => r.count));
              const unanswered = channel === "unanswered";
              return (
                <div key={channel} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "w-32 truncate text-right text-xs",
                      unanswered ? "text-neutral-600" : "text-neutral-400"
                    )}
                  >
                    {channelLabel(channel)}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        unanswered ? "bg-neutral-600/50" : "bg-brand-light/70"
                      )}
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-sm text-neutral-500 tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>

      {/* Push notification note */}
      <ChartCard
        title="Push Notifications"
        description="Reminder delivery channel"
      >
        <p className="text-sm text-neutral-400">
          Push subscriptions are stored in{" "}
          <code className="text-xs text-brand-light">push_subscriptions</code>.
          Notifications are sent via the{" "}
          <code className="text-xs text-brand-light">send-notification</code>{" "}
          edge function. Campaign analytics (open rates, click-throughs) require
          integration with an email/push analytics provider.
        </p>
      </ChartCard>
    </div>
  );
}
