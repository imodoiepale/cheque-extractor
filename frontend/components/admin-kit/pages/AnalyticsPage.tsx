'use client';
import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { PageHeader } from "../components/PageHeader";
import { ChartCard } from "../components/ChartCard";
import { KpiTile } from "../components/KpiTile";
import { EmptyState } from "../components/EmptyState";
import { callEdgeFn } from "../lib/api";
import { formatNumber } from "../lib/formatters";
import { useDateRange } from "../contexts/DateRangeContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/admin-kit/_deps/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventSummary {
  event_name: string;
  count: number;
  unique_users: number;
}

interface RawEvent {
  event_name: string;
  properties?: Record<string, unknown>;
  user_id?: string;
  created_at?: string;
}

interface EventsQueryResponse {
  events: RawEvent[];
  summary: EventSummary[];
}

interface FunnelStep {
  step: string;
  users: number;
  drop_off_pct: number;
}

interface FunnelQueryResponse {
  funnel: FunnelStep[];
}

interface TooltipPayload {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}

// ─── Shared tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: TooltipPayload) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0d1117] px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-neutral-500">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-sm text-white">
          {p.value.toLocaleString()}{" "}
          <span className="text-xs text-neutral-500">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Tab switcher ─────────────────────────────────────────────────────────────

type TabId =
  | "events"
  | "screens"
  | "funnel"
  | "features"
  | "conversion"
  | "landing"
  | "visitors"
  | "hourly";

const TABS: { id: TabId; label: string }[] = [
  { id: "events", label: "Events" },
  { id: "screens", label: "Screens" },
  { id: "funnel", label: "Funnel" },
  { id: "features", label: "Features" },
  { id: "conversion", label: "Conversion" },
  { id: "landing", label: "Landing" },
  { id: "visitors", label: "Visitors" },
  { id: "hourly", label: "By Hour" },
];

// ─── Tab: Events (existing) ───────────────────────────────────────────────────

function EventsTab({ from, to }: { from: string; to: string }) {
  const [selectedEvent, setSelectedEvent] = useState<string | undefined>(
    undefined
  );

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "events", from, to, selectedEvent],
    queryFn: () =>
      callEdgeFn<EventsQueryResponse>("admin-events-query", {
        from,
        to,
        eventName: selectedEvent,
        limit: 1000,
      }),
    staleTime: 60_000,
  });

  const summary = data?.summary ?? [];
  const topEvents = summary.slice(0, 15);

  return (
    <div className="space-y-8">
      <ChartCard
        title="Event Volume"
        description="Top events by occurrence count in period"
        loading={isLoading && !summary.length}
      >
        {selectedEvent && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-neutral-500">Filtered to:</span>
            <span className="rounded-full border border-brand/20 bg-brand/10 px-2 py-0.5 text-xs text-brand-light">
              {selectedEvent}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEvent(undefined)}
              className="h-6 px-2 text-xs text-neutral-500 hover:text-white"
            >
              Clear
            </Button>
          </div>
        )}

        {topEvents.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={topEvents}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
              barSize={16}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="event_name"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={160}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="events" radius={[0, 4, 4, 0]}>
                {topEvents.map((entry, i) => (
                  <Cell
                    key={entry.event_name}
                    fill={
                      selectedEvent === entry.event_name
                        ? "#7c3aed"
                        : i === 0
                          ? "#6d28d9"
                          : "#4c1d95"
                    }
                    cursor="pointer"
                    onClick={() =>
                      setSelectedEvent(
                        entry.event_name === selectedEvent
                          ? undefined
                          : entry.event_name
                      )
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="No events yet"
            description="Events will appear here once users interact with the app."
          />
        )}
      </ChartCard>

      {summary.length > 0 && (
        <ChartCard title="Event Summary" description="All events in period">
          <div className="space-y-0 divide-y divide-white/[0.04]">
            <div className="grid grid-cols-3 pb-2 text-xs tracking-wider text-neutral-500 uppercase">
              <span>Event</span>
              <span className="text-right">Occurrences</span>
              <span className="text-right">Unique Users</span>
            </div>
            {summary.map((e) => (
              <div
                key={e.event_name}
                onClick={() =>
                  setSelectedEvent(
                    e.event_name === selectedEvent ? undefined : e.event_name
                  )
                }
                className={cn(
                  "grid cursor-pointer grid-cols-3 py-2.5 text-sm transition-colors",
                  selectedEvent === e.event_name
                    ? "text-brand-light"
                    : "text-neutral-300 hover:text-white"
                )}
              >
                <span className="font-mono text-xs">{e.event_name}</span>
                <span className="text-right tabular-nums">
                  {formatNumber(e.count)}
                </span>
                <span className="text-right text-neutral-500 tabular-nums">
                  {formatNumber(e.unique_users)}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ─── Tab: Screens ─────────────────────────────────────────────────────────────

function ScreensTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "screens", from, to],
    queryFn: () =>
      callEdgeFn<EventsQueryResponse>("admin-events-query", {
        from,
        to,
        eventName: "screen_viewed",
        limit: 2000,
      }),
    staleTime: 60_000,
  });

  const screenData = useMemo(() => {
    const events = data?.events ?? [];
    const counts: Record<string, number> = {};
    for (const ev of events) {
      const screen =
        (ev.properties?.screen as string) ??
        (ev.properties?.screen_name as string) ??
        "unknown";
      counts[screen] = (counts[screen] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([screen, count]) => ({ screen, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [data]);

  return (
    <div className="space-y-8">
      <ChartCard
        title="Screen Heatmap"
        description="Top 20 screens by view count"
        loading={isLoading && !screenData.length}
      >
        {screenData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={screenData}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
              barSize={14}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="screen"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={150}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="views" radius={[0, 4, 4, 0]}>
                {screenData.map((entry, i) => {
                  // Gradient from bright violet to dim purple based on rank
                  const opacity = Math.max(0.35, 1 - i * 0.04);
                  return (
                    <Cell
                      key={entry.screen}
                      fill={`rgba(109, 40, 217, ${opacity})`}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="No screen_viewed events yet"
            description="Screen views will appear here once users navigate the app."
          />
        )}
      </ChartCard>

      {screenData.length > 0 && (
        <ChartCard
          title="Screen Visit Counts"
          description="Sorted by most visited"
        >
          <div className="divide-y divide-white/[0.04]">
            <div className="grid grid-cols-2 pb-2 text-xs tracking-wider text-neutral-500 uppercase">
              <span>Screen</span>
              <span className="text-right">Views</span>
            </div>
            {screenData.map((s) => (
              <div
                key={s.screen}
                className="grid grid-cols-2 py-2.5 text-sm text-neutral-300"
              >
                <span className="font-mono text-xs">{s.screen}</span>
                <span className="text-right tabular-nums">
                  {formatNumber(s.count)}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ─── Tab: Funnel ──────────────────────────────────────────────────────────────

function FunnelTab({ from, to }: { from: string; to: string }) {
  const FUNNEL_STEPS = [
    "signup_started",
    "signup_completed",
    "language_selected",
    "goal_selected",
    "survey_completed",
    "onboarding_completed",
    "ritual_started",
  ];

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "funnel", from, to],
    queryFn: () =>
      callEdgeFn<FunnelQueryResponse>("admin-funnel-query", {
        steps: FUNNEL_STEPS,
        from,
        to,
      }),
    staleTime: 60_000,
  });

  const funnel = data?.funnel ?? [];
  const maxUsers = funnel[0]?.users ?? 1;

  return (
    <div className="space-y-8">
      <ChartCard
        title="Onboarding Funnel"
        description="User drop-off at each onboarding step"
        loading={isLoading && !funnel.length}
      >
        {funnel.length > 0 ? (
          <div className="space-y-3 py-2">
            {funnel.map((step, i) => {
              const widthPct = (step.users / maxUsers) * 100;
              const isFirst = i === 0;
              return (
                <div key={step.step} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={cn(
                        "font-mono",
                        isFirst ? "text-brand-light" : "text-neutral-400"
                      )}
                    >
                      {step.step}
                    </span>
                    <div className="flex items-center gap-3 text-right">
                      <span className="font-medium text-white tabular-nums">
                        {formatNumber(step.users)}
                      </span>
                      {!isFirst && (
                        <span
                          className={cn(
                            "w-16 text-right tabular-nums",
                            step.drop_off_pct > 30
                              ? "text-red-400"
                              : step.drop_off_pct > 10
                                ? "text-amber-400"
                                : "text-emerald-400"
                          )}
                        >
                          −{step.drop_off_pct.toFixed(1)}%
                        </span>
                      )}
                      {isFirst && (
                        <span className="w-16 text-right text-xs text-neutral-600">
                          base
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-7 overflow-hidden rounded bg-white/[0.04]">
                    <div
                      className={cn(
                        "h-full rounded",
                        isFirst
                          ? "bg-brand"
                          : step.drop_off_pct > 30
                            ? "bg-brand"
                            : "bg-brand-dark"
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No funnel data"
            description="Funnel data will appear once the admin-funnel-query edge function returns results."
          />
        )}
      </ChartCard>

      {funnel.length > 0 && (
        <ChartCard
          title="Funnel Chart"
          description="Users reaching each step (absolute)"
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={funnel}
              margin={{ top: 0, right: 16, bottom: 40, left: 0 }}
              barSize={24}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="step"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="users" name="users" radius={[4, 4, 0, 0]}>
                {funnel.map((entry, i) => (
                  <Cell
                    key={entry.step}
                    fill={i === 0 ? "#6d28d9" : "#4c1d95"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

// ─── Tab: Features ────────────────────────────────────────────────────────────

interface FeatureRow {
  feature: string;
  count: number;
}

function FeaturesTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "features", from, to],
    queryFn: () =>
      callEdgeFn<EventsQueryResponse>("admin-events-query", {
        from,
        to,
        limit: 5000,
      }),
    staleTime: 60_000,
  });

  const { featureRows, guideTypeRows } = useMemo(() => {
    const events = data?.events ?? [];

    // Simple feature counts
    const counters: Record<string, number> = {
      ritual_completed: 0,
      guide_board_generated: 0,
      journal_entry_created: 0,
      guide_favorited: 0,
    };

    // guide_type breakdowns for ritual_completed and guide_board_generated
    const ritualByType: Record<string, number> = {};
    const boardByType: Record<string, number> = {};

    for (const ev of events) {
      const name = ev.event_name;
      if (name in counters) counters[name]++;

      if (name === "ritual_completed") {
        const gt = (ev.properties?.guide_type as string) ?? "unknown";
        ritualByType[gt] = (ritualByType[gt] ?? 0) + 1;
      }
      if (name === "guide_board_generated") {
        const gt = (ev.properties?.guide_type as string) ?? "unknown";
        boardByType[gt] = (boardByType[gt] ?? 0) + 1;
      }
    }

    const featureRows: FeatureRow[] = [
      { feature: "ritual_completed", count: counters.ritual_completed },
      {
        feature: "guide_board_generated",
        count: counters.guide_board_generated,
      },
      {
        feature: "journal_entry_created",
        count: counters.journal_entry_created,
      },
      { feature: "guide_favorited", count: counters.guide_favorited },
    ];

    const guideTypeRows: FeatureRow[] = [
      ...Object.entries(ritualByType).map(([gt, count]) => ({
        feature: `ritual · ${gt}`,
        count,
      })),
      ...Object.entries(boardByType).map(([gt, count]) => ({
        feature: `board · ${gt}`,
        count,
      })),
    ].sort((a, b) => b.count - a.count);

    return { featureRows, guideTypeRows };
  }, [data]);

  const chartData = featureRows.filter((r) => r.count > 0);

  return (
    <div className="space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {featureRows.map((row) => (
          <KpiTile
            key={row.feature}
            label={row.feature.replace(/_/g, " ")}
            value={formatNumber(row.count)}
            loading={isLoading}
          />
        ))}
      </div>

      <ChartCard
        title="Feature Usage"
        description="Core feature engagement in period"
        loading={isLoading && !chartData.length}
      >
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              margin={{ top: 0, right: 16, bottom: 30, left: 0 }}
              barSize={28}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="feature"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                angle={-20}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={entry.feature}
                    fill={i === 0 ? "#6d28d9" : "#4c1d95"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="No feature events yet"
            description="Feature usage will appear once users complete rituals, generate boards, and more."
          />
        )}
      </ChartCard>

      {guideTypeRows.length > 0 && (
        <ChartCard
          title="By Guide Type"
          description="Rituals completed and boards generated, grouped by guide type"
        >
          <div className="divide-y divide-white/[0.04]">
            <div className="grid grid-cols-2 pb-2 text-xs tracking-wider text-neutral-500 uppercase">
              <span>Feature · Guide Type</span>
              <span className="text-right">Count</span>
            </div>
            {guideTypeRows.map((row) => (
              <div
                key={row.feature}
                className="grid grid-cols-2 py-2.5 text-sm text-neutral-300"
              >
                <span className="font-mono text-xs">{row.feature}</span>
                <span className="text-right tabular-nums">
                  {formatNumber(row.count)}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ─── Tab: Conversion ──────────────────────────────────────────────────────────

interface SourceRow {
  screen: string;
  taps: number;
}

function ConversionTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "conversion", from, to],
    queryFn: () =>
      callEdgeFn<EventsQueryResponse>("admin-events-query", {
        from,
        to,
        limit: 5000,
      }),
    staleTime: 60_000,
  });

  const {
    steps,
    conversionRate,
    cancelled,
    failed,
    reminderShown,
    reminderDismissed,
    sourceRows,
    sourceConversion,
  } = useMemo(() => {
    const events = data?.events ?? [];

    const c: Record<string, number> = {};
    const sourceMap: Record<string, number> = {};
    // Per-source outcome tally powering the converted / failed / abandoned view.
    const srcStat: Record<
      string,
      { reached: number; started: number; converted: number; failed: number }
    > = {};
    const bump = (
      src: string,
      k: "reached" | "started" | "converted" | "failed"
    ) => {
      (srcStat[src] ??= { reached: 0, started: 0, converted: 0, failed: 0 })[
        k
      ] += 1;
    };

    for (const ev of events) {
      c[ev.event_name] = (c[ev.event_name] ?? 0) + 1;
      const src = (ev.properties?.source_screen as string) ?? "unknown";
      switch (ev.event_name) {
        case "premium_upgrade_tapped":
          sourceMap[src] = (sourceMap[src] ?? 0) + 1; // "Top Source Screens" (taps)
          bump(src, "reached");
          break;
        case "purchase_started":
          bump(src, "started");
          break;
        case "premium_upgrade_completed":
          bump(src, "converted");
          break;
        case "purchase_failed":
        case "purchase_cancelled":
          bump(src, "failed");
          break; // started but didn't complete
      }
    }

    // Full purchase funnel. paywall_viewed falls back to the older
    // premium_upgrade_tapped so historical data still renders.
    const viewed = c["paywall_viewed"] ?? c["premium_upgrade_tapped"] ?? 0;
    const planSelected = c["premium_plan_selected"] ?? 0;
    const started = c["purchase_started"] ?? 0;
    const completed = c["premium_upgrade_completed"] ?? 0;

    const rawSteps = [
      { step: "paywall_viewed", users: viewed },
      { step: "premium_plan_selected", users: planSelected },
      { step: "purchase_started", users: started },
      { step: "premium_upgrade_completed", users: completed },
    ];
    // drop_off relative to previous step.
    const steps = rawSteps.map((s, i) => ({
      ...s,
      drop_off_pct:
        i === 0 || rawSteps[i - 1].users === 0
          ? 0
          : Math.max(
              0,
              ((rawSteps[i - 1].users - s.users) / rawSteps[i - 1].users) * 100
            ),
    }));

    const conversionRate =
      viewed > 0 ? ((completed / viewed) * 100).toFixed(1) : "—";

    const sourceRows: SourceRow[] = Object.entries(sourceMap)
      .map(([screen, taps]) => ({ screen, taps }))
      .sort((a, b) => b.taps - a.taps);

    // Converted / Failed / Abandoned per source. abandoned = reached the paywall
    // but never started checkout; failed = started but cancelled/errored.
    const sourceConversion = Object.entries(srcStat)
      .map(([screen, s]) => ({
        screen,
        reached: s.reached,
        converted: s.converted,
        failed: s.failed,
        abandoned: Math.max(0, s.reached - s.started),
        convRate: s.reached > 0 ? (s.converted / s.reached) * 100 : 0,
      }))
      .sort((a, b) => b.reached - a.reached);

    return {
      steps,
      conversionRate,
      cancelled: c["purchase_cancelled"] ?? 0,
      failed: c["purchase_failed"] ?? 0,
      reminderShown: c["premium_reminder_shown"] ?? 0,
      reminderDismissed: c["premium_reminder_dismissed"] ?? 0,
      sourceRows,
      sourceConversion,
    };
  }, [data]);

  const maxStep = steps[0]?.users ?? 1;
  const biggestDrop = steps.reduce(
    (acc, s, i) =>
      i > 0 && s.drop_off_pct > acc.pct
        ? { step: s.step, pct: s.drop_off_pct }
        : acc,
    { step: "", pct: 0 }
  );

  return (
    <div className="space-y-8">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile
          label="Paywall Viewed"
          value={formatNumber(steps[0]?.users ?? 0)}
          loading={isLoading}
        />
        <KpiTile
          label="Purchase Started"
          value={formatNumber(steps[2]?.users ?? 0)}
          loading={isLoading}
        />
        <KpiTile
          label="Completed"
          value={formatNumber(steps[3]?.users ?? 0)}
          loading={isLoading}
        />
        <KpiTile
          label="View → Paid"
          value={conversionRate}
          suffix={
            typeof conversionRate === "string" && conversionRate !== "—"
              ? "%"
              : undefined
          }
          loading={isLoading}
        />
      </div>

      {/* Purchase funnel with step drop-off */}
      <ChartCard
        title="Purchase Funnel"
        description="Where users drop off between seeing the paywall and paying"
        loading={isLoading && !steps.some((s) => s.users > 0)}
      >
        {steps.some((s) => s.users > 0) ? (
          <div className="space-y-3 py-2">
            {steps.map((step, i) => {
              const widthPct = (step.users / maxStep) * 100;
              const isFirst = i === 0;
              return (
                <div key={step.step} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={cn(
                        "font-mono",
                        isFirst ? "text-brand-light" : "text-neutral-400"
                      )}
                    >
                      {step.step}
                    </span>
                    <div className="flex items-center gap-3 text-right">
                      <span className="font-medium text-white tabular-nums">
                        {formatNumber(step.users)}
                      </span>
                      {!isFirst ? (
                        <span
                          className={cn(
                            "w-16 text-right tabular-nums",
                            step.drop_off_pct > 30
                              ? "text-red-400"
                              : step.drop_off_pct > 10
                                ? "text-amber-400"
                                : "text-emerald-400"
                          )}
                        >
                          −{step.drop_off_pct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="w-16 text-right text-xs text-neutral-600">
                          base
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-7 overflow-hidden rounded bg-white/[0.04]">
                    <div
                      className={cn(
                        "h-full rounded",
                        isFirst
                          ? "bg-brand"
                          : step.drop_off_pct > 30
                            ? "bg-brand"
                            : "bg-brand-dark"
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {biggestDrop.step && (
              <p className="pt-2 text-xs text-neutral-500">
                Biggest drop-off:{" "}
                <span className="font-mono text-amber-400">
                  {biggestDrop.step}
                </span>{" "}
                (−{biggestDrop.pct.toFixed(1)}%)
              </p>
            )}
          </div>
        ) : (
          <EmptyState
            title="No purchase funnel data"
            description="Funnel data appears once users open the paywall (events: paywall_viewed → premium_plan_selected → purchase_started → premium_upgrade_completed)."
          />
        )}
      </ChartCard>

      {/* Why started purchases didn't complete + reminder modal */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile
          label="Cancelled"
          value={formatNumber(cancelled)}
          loading={isLoading}
        />
        <KpiTile
          label="Failed"
          value={formatNumber(failed)}
          loading={isLoading}
        />
        <KpiTile
          label="Reminder Shown"
          value={formatNumber(reminderShown)}
          loading={isLoading}
        />
        <KpiTile
          label="Reminder Dismissed"
          value={formatNumber(reminderDismissed)}
          loading={isLoading}
        />
      </div>

      {/* Conversion by source screen — converted vs failed vs abandoned */}
      <ChartCard
        title="Conversion by Source Screen"
        description="Where users opened premium, split by outcome. Abandoned = saw the paywall but never started checkout; Failed = started but cancelled/errored. (Outcome attribution by screen applies to events from this release onward.)"
        loading={isLoading && !sourceConversion.length}
      >
        {sourceConversion.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {[
                    "Source screen",
                    "Reached",
                    "Converted",
                    "Failed",
                    "Abandoned",
                    "Conv. rate",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "px-3 pb-2 text-xs font-medium whitespace-nowrap text-neutral-500",
                        i === 0 ? "text-left" : "text-right"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {sourceConversion.map((r) => (
                  <tr key={r.screen} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono text-xs text-neutral-300">
                      {r.screen}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-300 tabular-nums">
                      {formatNumber(r.reached)}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">
                      {formatNumber(r.converted)}
                    </td>
                    <td className="px-3 py-2 text-right text-red-400 tabular-nums">
                      {formatNumber(r.failed)}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-400 tabular-nums">
                      {formatNumber(r.abandoned)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-white tabular-nums">
                      {r.reached > 0 ? `${r.convRate.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No paywall opens yet"
            description="Populates as users open the premium screen (premium_upgrade_tapped → purchase_started → completed / failed)."
          />
        )}
      </ChartCard>

      {/* Source screens */}
      <ChartCard
        title="Top Source Screens"
        description="Screens where premium_upgrade_tapped was fired"
        loading={isLoading && !sourceRows.length}
      >
        {sourceRows.length > 0 ? (
          <>
            <ResponsiveContainer
              width="100%"
              height={Math.max(180, sourceRows.length * 36)}
            >
              <BarChart
                data={sourceRows.slice(0, 12)}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                barSize={16}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="screen"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={150}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="taps" name="taps" radius={[0, 4, 4, 0]}>
                  {sourceRows.slice(0, 12).map((entry, i) => (
                    <Cell
                      key={entry.screen}
                      fill={i === 0 ? "#6d28d9" : "#4c1d95"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 divide-y divide-white/[0.04]">
              <div className="grid grid-cols-2 pb-2 text-xs tracking-wider text-neutral-500 uppercase">
                <span>Source Screen</span>
                <span className="text-right">Taps</span>
              </div>
              {sourceRows.map((row) => (
                <div
                  key={row.screen}
                  className="grid grid-cols-2 py-2.5 text-sm text-neutral-300"
                >
                  <span className="font-mono text-xs">{row.screen}</span>
                  <span className="text-right tabular-nums">
                    {formatNumber(row.taps)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="No premium upgrade events"
            description="Conversion data will appear once users interact with the premium upgrade flow."
          />
        )}
      </ChartCard>
    </div>
  );
}

// ─── Tab: Landing ─────────────────────────────────────────────────────────────

interface LandingSectionRow {
  section: string;
  sessions: number;
  pct: number;
}

interface LandingAngleRow {
  angle: string;
  views: number;
  sessions: number;
}

interface LandingCtaRow {
  location: string;
  clicks: number;
}

interface LandingQueryResponse {
  totalViews: number;
  totalSessions: number;
  byAngle: LandingAngleRow[];
  sectionFunnel: LandingSectionRow[];
  ctaClicks: LandingCtaRow[];
}

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  problem: "Problem",
  opportunity: "Opportunity",
  product_reveal: "Product Reveal",
  curriculum: "Curriculum",
  bonus: "Bonus Stack",
  proof: "Proof Metrics",
  practice: "Practice Showcase",
  social_proof: "Social Proof",
  faq: "FAQ",
  final_cta: "Final CTA",
};

function LandingTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "landing", from, to],
    queryFn: () =>
      callEdgeFn<LandingQueryResponse>("admin-landing-query", { from, to }),
    staleTime: 60_000,
  });

  const totalViews = data?.totalViews ?? 0;
  const totalSessions = data?.totalSessions ?? 0;
  const sectionFunnel = data?.sectionFunnel ?? [];
  const ctaClicks = data?.ctaClicks ?? [];
  const byAngle = data?.byAngle ?? [];
  const totalCtaClicks = ctaClicks.reduce((s, r) => s + r.clicks, 0);

  const finalCtaReach = sectionFunnel.find((s) => s.section === "final_cta");
  const scrollRate =
    totalSessions > 0 && finalCtaReach
      ? ((finalCtaReach.sessions / totalSessions) * 100).toFixed(1)
      : "—";

  const funnelChartData = sectionFunnel.map((s, i) => ({
    ...s,
    label: SECTION_LABELS[s.section] ?? s.section,
    fill: `hsl(${260 - i * 14}, 70%, ${55 - i * 2}%)`,
  }));

  return (
    <div className="space-y-8">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiTile
          label="Landing Views"
          value={formatNumber(totalViews)}
          loading={isLoading}
        />
        <KpiTile
          label="Unique Sessions"
          value={formatNumber(totalSessions)}
          loading={isLoading}
        />
        <KpiTile
          label="Scroll-to-CTA Rate"
          value={scrollRate}
          suffix={scrollRate !== "—" ? "%" : undefined}
          loading={isLoading}
        />
      </div>

      {/* Section scroll funnel */}
      <ChartCard
        title="Section Scroll Depth"
        description="% of sessions that scrolled into each section (in page order)"
        loading={isLoading && !sectionFunnel.length}
      >
        {funnelChartData.some((s) => s.sessions > 0) ? (
          <ResponsiveContainer
            width="100%"
            height={Math.max(260, funnelChartData.length * 32)}
          >
            <BarChart
              data={funnelChartData}
              layout="vertical"
              margin={{ top: 0, right: 48, bottom: 0, left: 0 }}
              barSize={18}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={[0, totalSessions || 1]}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={130}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="sessions" name="sessions" radius={[0, 4, 4, 0]}>
                {funnelChartData.map((entry) => (
                  <Cell key={entry.section} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="No scroll data yet"
            description="Section views will appear once visitors reach your landing page."
          />
        )}

        {/* Pct table */}
        {sectionFunnel.some((s) => s.sessions > 0) && (
          <div className="mt-6 divide-y divide-white/[0.04]">
            <div className="grid grid-cols-3 pb-2 text-xs tracking-wider text-neutral-500 uppercase">
              <span>Section</span>
              <span className="text-right">Sessions</span>
              <span className="text-right">Reach %</span>
            </div>
            {sectionFunnel.map((row) => (
              <div
                key={row.section}
                className="grid grid-cols-3 py-2 text-sm text-neutral-300"
              >
                <span className="font-mono text-xs">
                  {SECTION_LABELS[row.section] ?? row.section}
                </span>
                <span className="text-right tabular-nums">
                  {formatNumber(row.sessions)}
                </span>
                <span className="text-right text-neutral-500 tabular-nums">
                  {row.pct}%
                </span>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      {/* CTA performance */}
      <ChartCard
        title="CTA Performance"
        description="Clicks by button location"
        loading={isLoading && !ctaClicks.length}
      >
        {ctaClicks.length > 0 ? (
          <div className="divide-y divide-white/[0.04]">
            <div className="grid grid-cols-3 pb-2 text-xs tracking-wider text-neutral-500 uppercase">
              <span>Location</span>
              <span className="text-right">Clicks</span>
              <span className="text-right">% of total</span>
            </div>
            {ctaClicks.map((row) => (
              <div
                key={row.location}
                className="grid grid-cols-3 py-2.5 text-sm text-neutral-300"
              >
                <span className="font-mono text-xs">{row.location}</span>
                <span className="text-right tabular-nums">
                  {formatNumber(row.clicks)}
                </span>
                <span className="text-right text-neutral-500 tabular-nums">
                  {totalCtaClicks > 0
                    ? ((row.clicks / totalCtaClicks) * 100).toFixed(1)
                    : "—"}
                  %
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No CTA clicks yet"
            description="CTA taps will appear here once visitors interact with the landing page."
          />
        )}
      </ChartCard>

      {/* Angle / variant breakdown */}
      {byAngle.length > 0 && (
        <ChartCard
          title="By Angle / Variant"
          description="Landing views split by ?lp= parameter"
        >
          <div className="divide-y divide-white/[0.04]">
            <div className="grid grid-cols-3 pb-2 text-xs tracking-wider text-neutral-500 uppercase">
              <span>Angle</span>
              <span className="text-right">Views</span>
              <span className="text-right">Sessions</span>
            </div>
            {byAngle.map((row) => (
              <div
                key={row.angle}
                className="grid grid-cols-3 py-2.5 text-sm text-neutral-300"
              >
                <span className="font-mono text-xs">{row.angle}</span>
                <span className="text-right tabular-nums">
                  {formatNumber(row.views)}
                </span>
                <span className="text-right text-neutral-500 tabular-nums">
                  {formatNumber(row.sessions)}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ─── Tab: Visitors (anonymous landing + geo) ─────────────────────────────────

interface VisitorBucket {
  label: string;
  sessions: number;
}
interface VisitorsQueryResponse {
  totalVisitors: number;
  signups: number;
  convertedSessions: number;
  bounced: number;
  conversionPct: number;
  byChannel: VisitorBucket[];
  bySource: VisitorBucket[];
  byCountry: VisitorBucket[];
  byTimezone: VisitorBucket[];
}

function BreakdownCard({
  title,
  description,
  rows,
  colLabel,
}: {
  title: string;
  description: string;
  rows: VisitorBucket[];
  colLabel: string;
}) {
  const total = rows.reduce((s, r) => s + r.sessions, 0);
  return (
    <ChartCard title={title} description={description}>
      {rows.length > 0 ? (
        <div className="divide-y divide-white/[0.04]">
          <div className="grid grid-cols-3 pb-2 text-xs tracking-wider text-neutral-500 uppercase">
            <span>{colLabel}</span>
            <span className="text-right">Sessions</span>
            <span className="text-right">% of total</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-3 py-2.5 text-sm text-neutral-300"
            >
              <span className="truncate font-mono text-xs">{row.label}</span>
              <span className="text-right tabular-nums">
                {formatNumber(row.sessions)}
              </span>
              <span className="text-right text-neutral-500 tabular-nums">
                {total > 0 ? ((row.sessions / total) * 100).toFixed(1) : "—"}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No data yet"
          description="Visitor data appears once people land on the app."
        />
      )}
    </ChartCard>
  );
}

function VisitorsTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "visitors", from, to],
    queryFn: () =>
      callEdgeFn<VisitorsQueryResponse>("admin-visitors-query", { from, to }),
    staleTime: 60_000,
  });

  const totalVisitors = data?.totalVisitors ?? 0;
  const signups = data?.signups ?? 0;
  const conversionPct = data?.conversionPct ?? 0;
  const bounced = data?.bounced ?? 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile
          label="Visitors (landed)"
          value={formatNumber(totalVisitors)}
          loading={isLoading}
        />
        <KpiTile
          label="Signed up"
          value={formatNumber(signups)}
          loading={isLoading}
        />
        <KpiTile
          label="Conversion"
          value={String(conversionPct)}
          suffix="%"
          loading={isLoading}
        />
        <KpiTile
          label="Bounced (no signup)"
          value={formatNumber(bounced)}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <BreakdownCard
          title="By Channel"
          description="Where visitors came from (utm_source › referrer › direct)"
          rows={data?.byChannel ?? []}
          colLabel="Channel"
        />
        <BreakdownCard
          title="By UTM Source"
          description="Raw utm_source tag (none = no UTM)"
          rows={data?.bySource ?? []}
          colLabel="Source"
        />
        <BreakdownCard
          title="By Country"
          description="From CDN geo header when available"
          rows={data?.byCountry ?? []}
          colLabel="Country"
        />
        <BreakdownCard
          title="By Timezone"
          description="Browser timezone — a reliable geo proxy"
          rows={data?.byTimezone ?? []}
          colLabel="Timezone"
        />
      </div>
    </div>
  );
}

// ─── Tab: By Hour (voice demand histogram) ──────────────────────────────────

interface HourlyResponse {
  byHour: { hour: number; count: number }[];
  peak: number;
  warmHours: number[];
  total: number;
  days: number;
}

function HourlyTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "activity-by-hour"],
    queryFn: () =>
      callEdgeFn<HourlyResponse>("admin-activity-by-hour", { days: 21 }),
    staleTime: 60_000,
  });

  const byHour = data?.byHour ?? [];
  const warm = new Set(data?.warmHours ?? []);
  const chartData = byHour.map((b) => ({
    hour: b.hour,
    label: `${String(b.hour).padStart(2, "0")}:00`,
    count: b.count,
    warm: warm.has(b.hour),
  }));
  const nowHour = new Date().getUTCHours();

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiTile
          label="Voice generations (21d)"
          value={formatNumber(data?.total ?? 0)}
          loading={isLoading}
        />
        <KpiTile
          label="Peak hour volume"
          value={formatNumber(data?.peak ?? 0)}
          loading={isLoading}
        />
        <KpiTile
          label="Warm windows (UTC)"
          value={String(data?.warmHours?.length ?? 0)}
          suffix=" hrs"
          loading={isLoading}
        />
      </div>

      <ChartCard
        title="Voice demand by hour (UTC)"
        description="When voice is actually generated — the signal the GPU pre-warmer learns from. Highlighted bars are current warm windows; the ▾ marks the current UTC hour."
        loading={isLoading && !byHour.length}
      >
        {chartData.some((d) => d.count > 0) ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={chartData}
              margin={{ top: 16, right: 8, bottom: 0, left: -16 }}
              barSize={14}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                contentStyle={{
                  background: "#0d1117",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e5e7eb" }}
                formatter={(v: number) => [formatNumber(v), "generations"]}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={
                      d.hour === nowHour
                        ? "#F2CC66"
                        : d.warm
                          ? "#8B6BFF"
                          : "rgba(139,107,255,0.28)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="No voice activity yet"
            description="Once users generate ritual voiceovers, the hourly demand pattern appears here."
          />
        )}
        {(data?.warmHours?.length ?? 0) > 0 && (
          <p className="mt-4 text-xs text-neutral-500">
            Warm windows:{" "}
            {data!.warmHours
              .map((h) => `${String(h).padStart(2, "0")}:00`)
              .join(", ")}{" "}
            UTC — the pre-warmer pings the GPU during these hours so the first
            user of a peak isn't cold.
          </p>
        )}
      </ChartCard>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const dateRange = useDateRange();
  const [tab, setTab] = useState<TabId>("events");

  const from = dateRange.from.toISOString();
  const to = dateRange.to.toISOString();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Event explorer, funnels and user behaviour"
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.06] pb-0">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === id
                ? "border-brand text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "events" && <EventsTab from={from} to={to} />}
      {tab === "screens" && <ScreensTab from={from} to={to} />}
      {tab === "funnel" && <FunnelTab from={from} to={to} />}
      {tab === "features" && <FeaturesTab from={from} to={to} />}
      {tab === "conversion" && <ConversionTab from={from} to={to} />}
      {tab === "landing" && <LandingTab from={from} to={to} />}
      {tab === "visitors" && <VisitorsTab from={from} to={to} />}
      {tab === "hourly" && <HourlyTab />}
    </div>
  );
}
