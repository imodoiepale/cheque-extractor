'use client';
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/admin-kit/_deps/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/admin-kit/_deps/components/ui/tabs";
import { Badge } from "@/components/admin-kit/_deps/components/ui/badge";
import { Button } from "@/components/admin-kit/_deps/components/ui/button";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/admin-kit/_deps/components/ui/alert-dialog";
import { callEdgeFn } from "../lib/api";
import { formatRelative } from "../lib/formatters";
import { EmptyState } from "./EmptyState";
import { PRICE_MONTHLY_USD, PRICE_YEARLY_USD, formatUsd } from "@/components/admin-kit/_deps/lib/pricing";
import { cn } from "@/lib/utils";

interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  display_name: string | null;
  created_at: string;
  last_active_at: string | null;
  is_premium: boolean;
  premium_plan: "monthly" | "yearly" | null;
  premium_grant_expires_at: string | null;
  premium_grant_source: string | null;
  suspended: boolean;
  country_code: string | null;
  utm_source: string | null;
  utm_medium?: string | null;
  referrer?: string | null;
  signup_platform?: string | null;
  heard_about?: string | null;
  first_screen?: string | null;
  goal_id?: string | null;
  voice_clone_status?: 'pending' | 'cloning' | 'ready' | 'failed' | null;
  language?: string | null;
}

type GrantDuration = '7d' | '30d' | '3m' | '6m' | '1y' | 'lifetime';

const GRANT_OPTIONS: { value: GrantDuration; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
  { value: 'lifetime', label: 'Lifetime' },
];

function isGrantActive(profile: { premium_grant_expires_at: string | null }): boolean {
  if (!profile.premium_grant_expires_at) return false;
  return new Date(profile.premium_grant_expires_at) > new Date();
}

function formatGrantExpiry(profile: { premium_grant_expires_at: string | null }): string {
  if (!profile.premium_grant_expires_at) return '';
  const exp = new Date(profile.premium_grant_expires_at);
  // Lifetime sentinel
  if (exp.getFullYear() >= 9000) return 'Lifetime grant';
  const days = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  return `Granted — expires in ${days} day${days === 1 ? '' : 's'}`;
}

interface RitualSession {
  id: string;
  guide_type: string;
  completed_at: string;
  duration_seconds: number;
}

interface JournalEntry {
  id: string;
  created_at: string;
  word_count: number;
}

interface BoardEntry {
  id: string;
  created_at: string;
  guide_type: string;
}

interface FeedbackEntry {
  id: string;
  created_at: string;
  message: string;
  type: string;
}

interface InvoiceEntry {
  stripe_id: string;
  status: string;
  amount_paid_cents: number | null;
  currency: string | null;
  paid_at: string | null;
  created_at: string;
  hosted_invoice_url: string | null;
}

interface MeditationEntry {
  id: string;
  minutes: number;
  logged_at: string;
}

interface ActivityEvent {
  event_name: string;
  occurred_at: string;
  properties?: Record<string, unknown> | null;
}

interface UserDetail {
  profile: UserProfile;
  rituals: RitualSession[];
  journals: JournalEntry[];
  boards: BoardEntry[];
  feedback: FeedbackEntry[];
  invoices?: InvoiceEntry[];
  meditation?: MeditationEntry[];
  events?: ActivityEvent[];
}

// Build a per-day activity log from all the user's actions. Groups by LOCAL date
// (admin's tz is fine for an ops view). Newest day first, capped for the drawer.
interface DayLog {
  date: string;              // YYYY-MM-DD
  rituals: { guide: string; at: string }[];
  journals: { title: string; at: string }[];
  meditationMinutes: number;
  appOpens: number;          // app_landed / login_completed count
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildDailyLog(data: UserDetail, maxDays = 21): DayLog[] {
  const map = new Map<string, DayLog>();
  const day = (iso: string): DayLog => {
    const k = dayKey(iso);
    let d = map.get(k);
    if (!d) { d = { date: k, rituals: [], journals: [], meditationMinutes: 0, appOpens: 0 }; map.set(k, d); }
    return d;
  };
  for (const r of data.rituals ?? []) if (r.completed_at) day(r.completed_at).rituals.push({ guide: r.guide_type, at: r.completed_at });
  for (const j of data.journals ?? []) if (j.created_at) day(j.created_at).journals.push({ title: (j as unknown as { title?: string }).title || "Entry", at: j.created_at });
  for (const m of data.meditation ?? []) if (m.logged_at) day(m.logged_at).meditationMinutes += m.minutes || 0;
  for (const e of data.events ?? []) {
    if ((e.event_name === "app_landed" || e.event_name === "login_completed") && e.occurred_at) day(e.occurred_at).appOpens += 1;
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, maxDays);
}

function timeOf(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}

interface UserActionResponse {
  ok: boolean;
  message: string;
}

interface UserDetailDrawerProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onActionComplete?: () => void;
}

export function UserDetailDrawer({ userId, open, onClose, onActionComplete }: UserDetailDrawerProps) {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [grantLoading, setGrantLoading] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", userId],
    queryFn: () => callEdgeFn<UserDetail>("admin-user-detail", { targetUserId: userId }),
    enabled: !!userId && open,
    staleTime: 30_000,
  });

  async function runAction(action: string) {
    if (!userId) return;
    setActionLoading(action);
    try {
      const res = await callEdgeFn<UserActionResponse>("admin-user-action", { userId, action });
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onActionComplete?.();
      if (action === "delete") onClose();
    } catch (err) {
      toast.error(`Action failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function runGrant(duration: GrantDuration | null) {
    if (!userId) return;
    const key = duration ?? 'revoke';
    setGrantLoading(key);
    try {
      await callEdgeFn("admin-grant-premium", { targetUserId: userId, duration });
      toast.success(duration === null ? "Grant revoked" : `Granted ${GRANT_OPTIONS.find(o => o.value === duration)?.label ?? duration}`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onActionComplete?.();
    } catch (err) {
      toast.error(`Grant failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setGrantLoading(null);
    }
  }

  const user = data?.profile;
  // `||` fallback handles empty-string display_name correctly (??-fallback lets "" through and crashes on [0])
  const initialChar = (user?.display_name || user?.email || "?")[0] || "?";
  const initials = initialChar.toUpperCase();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[520px] max-w-full bg-gradient-to-b from-[#0b0f14] via-[#0b0f14] to-[#070b10] border-white/[0.08] p-0 overflow-y-auto"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>User Detail</SheetTitle>
        </SheetHeader>

        {isLoading || !user ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-12 w-12 rounded-full bg-white/[0.06]" />
            <Skeleton className="h-5 w-48 bg-white/[0.06]" />
            <Skeleton className="h-4 w-32 bg-white/[0.06]" />
          </div>
        ) : (
          <>
            {/* Cinematic header with gradient backdrop + larger avatar */}
            <div className="relative p-6 border-b border-white/[0.06] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-brand/[0.08] via-transparent to-amber-500/[0.04] pointer-events-none" />
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-brand/[0.07] blur-3xl pointer-events-none" />
              <div className="relative flex items-start gap-4">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-brand/30 to-brand/10 ring-1 ring-brand/30 flex items-center justify-center text-brand font-semibold text-xl flex-shrink-0 shadow-lg shadow-brand/10">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white text-base truncate">
                    {user.display_name || user.full_name || user.email}
                  </p>
                  {(user.display_name || user.full_name) && (
                    <p className="text-xs text-neutral-500 truncate mt-0.5">{user.email}</p>
                  )}
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {/* Plan — Premium > Granted > Free hierarchy */}
                    {user.is_premium ? (
                      <Badge variant="outline" className="text-[11px] border-brand/40 bg-brand/15 text-brand">
                        ✦ {user.premium_plan === "yearly" ? "Annual" : "Monthly"}
                      </Badge>
                    ) : isGrantActive(user) ? (
                      <Badge variant="outline" className="text-[11px] border-amber-500/40 bg-amber-500/15 text-amber-200">
                        ✦ {formatGrantExpiry(user)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] border-white/[0.08] text-neutral-500">
                        Free
                      </Badge>
                    )}
                    {user.suspended && (
                      <Badge variant="outline" className="text-[11px] border-red-500/30 bg-red-500/10 text-red-300">
                        Suspended
                      </Badge>
                    )}
                    {user.voice_clone_status === 'ready' && (
                      <Badge variant="outline" className="text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                        🎙 Voice ready
                      </Badge>
                    )}
                    {user.country_code && (
                      <Badge variant="outline" className="text-[11px] border-white/[0.08] bg-white/[0.02] text-neutral-300">
                        {user.country_code.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs — actions tab gets a subtle dot when grant active to draw attention */}
            <Tabs defaultValue="activity" className="flex-1">
              <TabsList className="w-full rounded-none bg-transparent border-b border-white/[0.06] px-6 gap-1 h-auto pb-0">
                {(["activity", "payments", "billing", "actions"] as const).map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-brand data-[state=active]:text-white text-neutral-500 px-3 py-3 capitalize text-sm bg-transparent hover:text-neutral-300 transition-colors"
                  >
                    {tab}
                    {tab === 'actions' && isGrantActive(user) && (
                      <span className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px] shadow-amber-400" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Activity */}
              <TabsContent value="activity" className="p-6 space-y-6">
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { label: "Rituals", value: data.rituals.length, accent: 'text-brand-light' },
                    { label: "Journals", value: data.journals.length, accent: 'text-emerald-300' },
                    { label: "Boards", value: data.boards.length, accent: 'text-amber-300' },
                  ].map(({ label, value, accent }) => (
                    <div key={label} className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.025] to-transparent p-3.5 text-center">
                      <p className={cn("text-2xl font-bold tabular-nums", accent)}>{value}</p>
                      <p className="text-[10px] text-neutral-500 uppercase tracking-wider mt-1">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Last check-in + where they came from */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500 uppercase tracking-wider">Last check-in</span>
                    <span className="text-sm text-neutral-200">{user.last_active_at ? formatRelative(user.last_active_at) : "Never"}</span>
                  </div>
                  {(user.utm_source || user.referrer || user.heard_about || user.signup_platform || user.first_screen) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {user.utm_source && <Badge variant="outline" className="text-[10px] border-white/[0.08] bg-white/[0.02] text-neutral-300">src: {user.utm_source}{user.utm_medium ? ` / ${user.utm_medium}` : ""}</Badge>}
                      {user.referrer && <Badge variant="outline" className="text-[10px] border-white/[0.08] bg-white/[0.02] text-neutral-300">ref: {user.referrer}</Badge>}
                      {user.heard_about && <Badge variant="outline" className="text-[10px] border-white/[0.08] bg-white/[0.02] text-neutral-300">said: {user.heard_about}</Badge>}
                      {user.signup_platform && <Badge variant="outline" className="text-[10px] border-white/[0.08] bg-white/[0.02] text-neutral-300">{user.signup_platform}</Badge>}
                    </div>
                  )}
                </div>

                {/* Per-day activity log — everything that happened, by day */}
                {(() => {
                  const days = buildDailyLog(data);
                  if (!days.length) return null;
                  return (
                    <div>
                      <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Daily activity</p>
                      <div className="space-y-2">
                        {days.map((d) => (
                          <div key={d.date} className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm text-neutral-200 font-medium">
                                {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                              </span>
                              <div className="flex gap-1.5">
                                {d.rituals.length > 0 && <Badge variant="outline" className="text-[10px] border-brand/25 bg-brand/10 text-brand-light">{d.rituals.length} ritual{d.rituals.length > 1 ? "s" : ""}</Badge>}
                                {d.journals.length > 0 && <Badge variant="outline" className="text-[10px] border-emerald-500/25 bg-emerald-500/10 text-emerald-300">{d.journals.length} journal{d.journals.length > 1 ? "s" : ""}</Badge>}
                                {d.meditationMinutes > 0 && <Badge variant="outline" className="text-[10px] border-amber-500/25 bg-amber-500/10 text-amber-300">{d.meditationMinutes}m med</Badge>}
                                {d.appOpens > 0 && <Badge variant="outline" className="text-[10px] border-white/[0.08] bg-white/[0.02] text-neutral-400">{d.appOpens} open{d.appOpens > 1 ? "s" : ""}</Badge>}
                              </div>
                            </div>
                            <div className="space-y-0.5">
                              {d.rituals.map((r, i) => (
                                <div key={"r" + i} className="flex items-center justify-between text-xs">
                                  <span className="text-neutral-400 capitalize">🧘 {r.guide.replace("_", " ")} ritual</span>
                                  <span className="text-neutral-600">{timeOf(r.at)}</span>
                                </div>
                              ))}
                              {d.journals.map((j, i) => (
                                <div key={"j" + i} className="flex items-center justify-between text-xs">
                                  <span className="text-neutral-400 truncate">✍️ {j.title}</span>
                                  <span className="text-neutral-600 shrink-0 ml-2">{timeOf(j.at)}</span>
                                </div>
                              ))}
                              {d.meditationMinutes > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-neutral-400">🌙 Meditation logged</span>
                                  <span className="text-neutral-600">{d.meditationMinutes} min</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {data.rituals.length > 0 && (
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Recent Rituals</p>
                    <div className="space-y-1">
                      {data.rituals.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center justify-between py-1.5 text-sm">
                          <span className="text-neutral-300 capitalize">{r.guide_type.replace("_", " ")}</span>
                          <span className="text-neutral-600 text-xs">{formatRelative(r.completed_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.journals.length > 0 && (
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Recent Journals</p>
                    <div className="space-y-1">
                      {data.journals.slice(0, 5).map((j) => (
                        <div key={j.id} className="flex items-center justify-between py-1.5 text-sm">
                          <span className="text-neutral-300">{j.word_count} words</span>
                          <span className="text-neutral-600 text-xs">{formatRelative(j.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.rituals.length === 0 && data.journals.length === 0 && (
                  <EmptyState title="No activity yet" description="This user hasn't started any rituals or journals." />
                )}
              </TabsContent>

              {/* Payments */}
              <TabsContent value="payments" className="p-6 space-y-4">
                {data.invoices && data.invoices.length > 0 ? (
                  <div className="space-y-2">
                    {data.invoices.map((inv) => (
                      <div key={inv.stripe_id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                        <div>
                          <p className="text-sm text-neutral-200">
                            {inv.status === 'paid' ? '✓ Paid' : inv.status === 'payment_failed' ? '✗ Failed' : inv.status}
                          </p>
                          <p className="text-xs text-neutral-600">
                            {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : new Date(inv.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-neutral-200">
                            ${((inv.amount_paid_cents ?? 0) / 100).toFixed(2)} {(inv.currency ?? 'usd').toUpperCase()}
                          </p>
                          {inv.hosted_invoice_url && (
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-light hover:text-brand-light">
                              View
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No payments yet" description="Payment history will appear here after the first charge." />
                )}
              </TabsContent>

              {/* Billing */}
              <TabsContent value="billing" className="p-6 space-y-4">
                <div className="space-y-3">
                  {[
                    {
                      // Label only — the amount this user is actually billed
                      // lives on their Stripe subscription (and may be a legacy
                      // or promo price). These are the CURRENT list prices from
                      // src/lib/pricing.ts; for the real figure, read the
                      // Payments tab above, which renders amount_paid_cents.
                      label: "Plan",
                      value: user.is_premium
                        ? user.premium_plan === "yearly"
                          ? `Annual (${formatUsd(PRICE_YEARLY_USD)}/yr)`
                          : `Monthly (${formatUsd(PRICE_MONTHLY_USD)}/mo)`
                        : "Free",
                    },
                    { label: "Member since", value: formatRelative(user.created_at) },
                    { label: "Last active", value: user.last_active_at ? formatRelative(user.last_active_at) : "Never" },
                    ...(user.utm_source ? [{ label: "Acquisition", value: user.utm_source }] : []),
                    ...(user.country_code ? [{ label: "Country", value: user.country_code.toUpperCase() }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                      <span className="text-sm text-neutral-500">{label}</span>
                      <span className="text-sm text-neutral-200">{value}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* Actions */}
              <TabsContent value="actions" className="p-6 space-y-3">
                {/* Grant Premium */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-amber-200">Grant Premium Access</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {isGrantActive(user)
                        ? formatGrantExpiry(user)
                        : "Grant a free premium window — auto-expires."}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {GRANT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => runGrant(opt.value)}
                        disabled={!!grantLoading}
                        className={cn(
                          "h-8 px-2 rounded-md text-xs font-medium border transition-colors",
                          "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
                          "disabled:opacity-40 disabled:cursor-not-allowed"
                        )}
                      >
                        {grantLoading === opt.value ? "…" : opt.label}
                      </button>
                    ))}
                  </div>
                  {isGrantActive(user) && (
                    <button
                      onClick={() => {
                        if (confirm("Revoke premium grant for this user?")) runGrant(null);
                      }}
                      disabled={!!grantLoading}
                      className="w-full h-8 rounded-md text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 disabled:opacity-40 transition-colors"
                    >
                      {grantLoading === "revoke" ? "Revoking…" : "Revoke Grant"}
                    </button>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="w-full border-white/[0.08] bg-transparent text-neutral-300 hover:text-white hover:bg-white/[0.04]"
                  disabled={actionLoading === "reset_password"}
                  onClick={() => runAction("reset_password")}
                >
                  {actionLoading === "reset_password" ? "Sending…" : "Reset Password"}
                </Button>

                {user.suspended ? (
                  <Button
                    variant="outline"
                    className="w-full border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10"
                    disabled={actionLoading === "unsuspend"}
                    onClick={() => runAction("unsuspend")}
                  >
                    {actionLoading === "unsuspend" ? "Unsuspending…" : "Unsuspend Account"}
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full border-orange-500/30 bg-orange-500/5 text-orange-400 hover:bg-orange-500/10"
                        disabled={!!actionLoading}
                      >
                        Suspend Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#0d1117] border-white/[0.08]">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Suspend this account?</AlertDialogTitle>
                        <AlertDialogDescription className="text-neutral-400">
                          The user will be unable to sign in until unsuspended.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-white/[0.08] bg-transparent text-neutral-400">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-orange-500 text-white hover:bg-orange-600"
                          onClick={() => runAction("suspend")}
                        >
                          Suspend
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/10"
                      disabled={!!actionLoading}
                    >
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-[#0d1117] border-white/[0.08]">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">Delete this account?</AlertDialogTitle>
                      <AlertDialogDescription className="text-neutral-400">
                        This action cannot be undone. All user data will be permanently deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-white/[0.08] bg-transparent text-neutral-400">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 text-white hover:bg-red-700"
                        onClick={() => runAction("delete")}
                      >
                        Delete permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
