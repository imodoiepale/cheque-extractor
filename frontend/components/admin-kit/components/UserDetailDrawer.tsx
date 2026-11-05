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
  return `Granted, expires in ${days} day${days === 1 ? '' : 's'}`;
}

interface JobEntry {
  job_id: string;
  pdf_name: string | null;
  status: string;
  total_checks: number | null;
  created_at: string;
  completed_at: string | null;
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

interface UserDetail {
  profile: UserProfile;
  /** The firm's recent extraction jobs (check_jobs has no user_id). */
  jobs?: JobEntry[];
  invoices?: InvoiceEntry[];
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
        className="w-[520px] max-w-full bg-gradient-to-b from-surface via-surface to-surface border-glass-hairline p-0 overflow-y-auto"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>User Detail</SheetTitle>
        </SheetHeader>

        {isLoading || !user ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-12 w-12 rounded-full bg-surface-sunken" />
            <Skeleton className="h-5 w-48 bg-surface-sunken" />
            <Skeleton className="h-4 w-32 bg-surface-sunken" />
          </div>
        ) : (
          <>
            {/* Cinematic header with gradient backdrop + larger avatar */}
            <div className="relative p-6 border-b border-glass-hairline overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-brand/[0.08] via-transparent to-warning-bg pointer-events-none" />
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-brand/[0.07] blur-3xl pointer-events-none" />
              <div className="relative flex items-start gap-4">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-brand/30 to-brand/10 ring-1 ring-brand/30 flex items-center justify-center text-brand font-semibold text-xl flex-shrink-0 shadow-lg shadow-brand/10">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-strong text-base truncate">
                    {user.display_name || user.full_name || user.email}
                  </p>
                  {(user.display_name || user.full_name) && (
                    <p className="text-xs text-ink-soft truncate mt-0.5">{user.email}</p>
                  )}
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {/* Plan — Premium > Granted > Free hierarchy */}
                    {user.is_premium ? (
                      <Badge variant="outline" className="text-[11px] border-brand/40 bg-brand/15 text-brand">
                        ✦ {user.premium_plan === "yearly" ? "Annual" : "Monthly"}
                      </Badge>
                    ) : isGrantActive(user) ? (
                      <Badge variant="outline" className="text-[11px] border-warning-border bg-warning-bg text-warning-text">
                        ✦ {formatGrantExpiry(user)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] border-glass-hairline text-ink-soft">
                        Free
                      </Badge>
                    )}
                    {user.suspended && (
                      <Badge variant="outline" className="text-[11px] border-error-border bg-error-bg text-error-text">
                        Suspended
                      </Badge>
                    )}
                    {user.voice_clone_status === 'ready' && (
                      <Badge variant="outline" className="text-[11px] border-success-border bg-success-bg text-success-text">
                        🎙 Voice ready
                      </Badge>
                    )}
                    {user.country_code && (
                      <Badge variant="outline" className="text-[11px] border-glass-hairline bg-surface-sunken text-ink-body">
                        {user.country_code.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs — actions tab gets a subtle dot when grant active to draw attention */}
            <Tabs defaultValue="activity" className="flex-1">
              <TabsList className="w-full rounded-none bg-transparent border-b border-glass-hairline px-6 gap-1 h-auto pb-0">
                {(["activity", "payments", "billing", "actions"] as const).map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-brand data-[state=active]:text-ink-strong text-ink-soft px-3 py-3 capitalize text-sm bg-transparent hover:text-ink-body transition-colors"
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
                {(() => {
                  const jobs = data.jobs ?? [];
                  const checks = jobs.reduce((n, j) => n + (j.total_checks ?? 0), 0);
                  const done = jobs.filter((j) => j.status === "complete" || j.status === "completed").length;
                  return (
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { label: "Extractions", value: jobs.length, accent: "text-brand" },
                        { label: "Checks", value: checks, accent: "text-success-text" },
                        { label: "Completed", value: done, accent: "text-ink-strong" },
                      ].map(({ label, value, accent }) => (
                        <div key={label} className="rounded-xl border border-glass-hairline bg-gradient-to-b from-brand-wash/40 to-transparent p-3.5 text-center">
                          <p className={cn("text-2xl font-bold tabular-nums", accent)}>{value}</p>
                          <p className="text-[10px] text-ink-soft uppercase tracking-wider mt-1">{label}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Last active + where they came from */}
                <div className="rounded-card border border-glass-hairline bg-surface-sunken p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-soft uppercase tracking-wider">Last active</span>
                    <span className="text-sm text-ink-strong">{user.last_active_at ? formatRelative(user.last_active_at) : "Never"}</span>
                  </div>
                  {(user.utm_source || user.referrer || user.heard_about || user.signup_platform || user.first_screen) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {user.utm_source && <Badge variant="outline" className="text-[10px] border-glass-hairline bg-surface-sunken text-ink-body">src: {user.utm_source}{user.utm_medium ? ` / ${user.utm_medium}` : ""}</Badge>}
                      {user.referrer && <Badge variant="outline" className="text-[10px] border-glass-hairline bg-surface-sunken text-ink-body">ref: {user.referrer}</Badge>}
                      {user.heard_about && <Badge variant="outline" className="text-[10px] border-glass-hairline bg-surface-sunken text-ink-body">said: {user.heard_about}</Badge>}
                      {user.signup_platform && <Badge variant="outline" className="text-[10px] border-glass-hairline bg-surface-sunken text-ink-body">{user.signup_platform}</Badge>}
                    </div>
                  )}
                </div>

                {data.jobs && data.jobs.length > 0 ? (
                  <div>
                    <p className="text-xs text-ink-soft uppercase tracking-wider mb-2">Recent extractions (firm)</p>
                    <div className="space-y-1">
                      {data.jobs.slice(0, 10).map((j) => (
                        <div key={j.job_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span className="text-ink-body truncate">{j.pdf_name || j.job_id}</span>
                          <span className="flex shrink-0 items-center gap-2 text-xs">
                            <span className="text-ink-soft tabular-nums">{j.total_checks ?? 0} checks</span>
                            <Badge variant="outline" className="text-[10px] border-glass-hairline bg-surface-sunken text-ink-soft capitalize">{j.status}</Badge>
                            <span className="text-ink-faint">{formatRelative(j.created_at)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState title="No extractions yet" description="This firm hasn't processed any cheques." />
                )}
              </TabsContent>

              {/* Payments */}
              <TabsContent value="payments" className="p-6 space-y-4">
                {data.invoices && data.invoices.length > 0 ? (
                  <div className="space-y-2">
                    {data.invoices.map((inv) => (
                      <div key={inv.stripe_id} className="flex items-center justify-between py-2 border-b border-glass-hairline last:border-0">
                        <div>
                          <p className="text-sm text-ink-strong">
                            {inv.status === 'paid' ? '✓ Paid' : inv.status === 'payment_failed' ? '✗ Failed' : inv.status}
                          </p>
                          <p className="text-xs text-ink-faint">
                            {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : new Date(inv.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-ink-strong">
                            ${((inv.amount_paid_cents ?? 0) / 100).toFixed(2)} {(inv.currency ?? 'usd').toUpperCase()}
                          </p>
                          {inv.hosted_invoice_url && (
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:text-brand">
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
                      // Billing PERIOD only, deliberately without an amount.
                      // This used to print DepthMe's $14.99/mo and $99.99/yr,
                      // which are not Kyriq prices at all. Kyriq sells three
                      // tiers ($249 / $649 / $1,299) and this record carries
                      // only `premium_plan` — monthly or yearly — with no tier,
                      // so no single figure here can be right. A wrong number
                      // is worse than none: the Payments tab above renders
                      // amount_paid_cents, which is what was actually charged.
                      label: "Plan",
                      value: user.is_premium
                        ? user.premium_plan === "yearly" ? "Annual" : "Monthly"
                        : "Free",
                    },
                    { label: "Member since", value: formatRelative(user.created_at) },
                    { label: "Last active", value: user.last_active_at ? formatRelative(user.last_active_at) : "Never" },
                    ...(user.utm_source ? [{ label: "Acquisition", value: user.utm_source }] : []),
                    ...(user.country_code ? [{ label: "Country", value: user.country_code.toUpperCase() }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-glass-hairline last:border-0">
                      <span className="text-sm text-ink-soft">{label}</span>
                      <span className="text-sm text-ink-strong">{value}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* Actions */}
              <TabsContent value="actions" className="p-6 space-y-3">
                {/* Grant Premium */}
                <div className="rounded-lg border border-warning-border bg-warning-bg p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-warning-text">Comp paid access</p>
                    <p className="text-xs text-ink-soft mt-0.5">
                      {isGrantActive(user)
                        ? formatGrantExpiry(user)
                        : "Grant this firm a free paid-plan window, auto-expires."}
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
                          "border-warning-border bg-warning-bg text-warning-text hover:bg-warning-bg",
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
                        if (confirm("Revoke the comp grant for this firm?")) runGrant(null);
                      }}
                      disabled={!!grantLoading}
                      className="w-full h-8 rounded-md text-xs text-error-text hover:bg-error-bg border border-error-border disabled:opacity-40 transition-colors"
                    >
                      {grantLoading === "revoke" ? "Revoking…" : "Revoke Grant"}
                    </button>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="w-full border-glass-hairline bg-transparent text-ink-body hover:text-ink-strong hover:bg-surface-sunken"
                  disabled={actionLoading === "reset_password"}
                  onClick={() => runAction("reset_password")}
                >
                  {actionLoading === "reset_password" ? "Sending…" : "Reset Password"}
                </Button>

                {user.suspended ? (
                  <Button
                    variant="outline"
                    className="w-full border-success-border bg-success-bg text-success-text hover:bg-success-bg"
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
                        className="w-full border-warning-border bg-warning-bg text-warning-text hover:bg-warning-bg"
                        disabled={!!actionLoading}
                      >
                        Suspend Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-surface border-glass-hairline">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-ink-strong">Suspend this account?</AlertDialogTitle>
                        <AlertDialogDescription className="text-ink-soft">
                          The user will be unable to sign in until unsuspended.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-glass-hairline bg-transparent text-ink-soft">Cancel</AlertDialogCancel>
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
                      className="w-full border-error-border bg-error-bg text-error-text hover:bg-error-bg"
                      disabled={!!actionLoading}
                    >
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-surface border-glass-hairline">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-ink-strong">Delete this account?</AlertDialogTitle>
                      <AlertDialogDescription className="text-ink-soft">
                        This permanently removes the login and the firm&apos;s data, and cannot be undone. Accounts with teammates, a live subscription, billing history or a QuickBooks trial claim are refused and should be suspended instead.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-glass-hairline bg-transparent text-ink-soft">Cancel</AlertDialogCancel>
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
