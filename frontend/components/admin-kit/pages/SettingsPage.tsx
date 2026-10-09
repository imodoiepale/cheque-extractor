'use client';
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { ChartCard } from "../components/ChartCard";
import { EmptyState } from "../components/EmptyState";
import { callEdgeFn } from "../lib/api";
import { supabase } from "@/components/admin-kit/shim/supabase";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Trash2, UserPlus, Shield, Flag, Server } from "lucide-react";
import { Badge } from "@/components/admin-kit/_deps/components/ui/badge";
import { Switch } from "@/components/admin-kit/_deps/components/ui/switch";
import { HEADING_FONTS, HEADING_FONT_DEFAULT } from "@/components/admin-kit/shim/stubs/lib_headingFonts";
import { APP_FONT_FLAG_KEY } from "@/components/admin-kit/shim/stubs/contexts_FontContext";
import {
  DEFAULT_TOAST_STYLE,
  TOAST_STYLE_FLAG_KEY,
  TOAST_STYLE_OPTIONS,
  resolveToastStyle,
} from "@/components/admin-kit/_deps/components/ui/toastStyles";

interface FeatureFlag {
  key: string;
  enabled: boolean;
  rollout_pct: number;
  updated_at: string;
}

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
}

// Mirrors depthme_5692/src/pages/funnel/variants.js — keep the letters in sync.
const FUNNEL_VARIANTS = [
  { letter: "a", key: "funnel_variant_a", name: "Original", hint: "Landing copy as delivered, full page" },
  { letter: "b", key: "funnel_variant_b", name: "Voice-first", hint: "Own-voice rituals lead" },
  { letter: "c", key: "funnel_variant_c", name: "Shadow-work pain", hint: "Problem thoughts lead" },
  { letter: "d", key: "funnel_variant_d", name: "Short", hint: "Hero → offer → close, no timer" },
  { letter: "e", key: "funnel_variant_e", name: "Social-proof-led", hint: "Testimonials lead" },
] as const;
const isFunnelFlag = (key: string) => key.startsWith("funnel_variant_");

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: flags, isLoading: flagsLoading, refetch: refetchFlags } = useQuery({
    queryKey: ["admin", "settings", "flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("key, enabled, rollout_pct, updated_at")
        .order("key");
      if (error) throw error;
      return (data ?? []) as FeatureFlag[];
    },
    staleTime: 30_000,
  });

  const { data: admins, isLoading: adminsLoading } = useQuery({
    queryKey: ["admin", "settings", "admins"],
    queryFn: () => callEdgeFn<{ admins: AdminUser[] }>("admin-list-admins", {}),
    staleTime: 60_000,
  });

  const VOICE_VARIANTS = [
    { value: "short", label: "Short", hint: "~2 min" },
    { value: "medium", label: "Medium", hint: "~4 min" },
    { value: "long", label: "Long", hint: "~7 min" },
  ] as const;

  const { data: voiceVariant, refetch: refetchVoice } = useQuery({
    queryKey: ["admin", "settings", "voice-script"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("targeting_rules")
        .eq("key", "voice_script_variant")
        .maybeSingle();
      if (error) throw error;
      const v = (data?.targeting_rules as { variant?: string } | null)?.variant;
      return v === "short" || v === "long" ? v : "medium";
    },
    staleTime: 30_000,
  });
  const [savingVoice, setSavingVoice] = useState(false);

  async function setVoiceVariant(variant: string) {
    setSavingVoice(true);
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ targeting_rules: { variant }, updated_at: new Date().toISOString() })
        .eq("key", "voice_script_variant");
      if (error) throw error;
      toast.success(`Voice script set to ${variant}`);
      refetchVoice();
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setSavingVoice(false);
    }
  }

  const { data: toastStyle, refetch: refetchToastStyle } = useQuery({
    queryKey: ["admin", "settings", "toast-style"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("targeting_rules")
        .eq("key", TOAST_STYLE_FLAG_KEY)
        .maybeSingle();
      if (error) throw error;
      return resolveToastStyle(
        (data?.targeting_rules as { variant?: string } | null)?.variant,
      );
    },
    staleTime: 30_000,
  });
  const [savingToastStyle, setSavingToastStyle] = useState(false);

  async function setToastStyle(variant: string) {
    setSavingToastStyle(true);
    try {
      // upsert, not update: unlike voice_script_variant this flag has no seed
      // migration, so the first save has to create the row. `enabled: true`
      // is load-bearing — the auth_read_enabled_flags RLS policy hides
      // disabled rows from the app, which would pin everyone to the default.
      const { error } = await supabase.from("feature_flags").upsert(
        {
          key: TOAST_STYLE_FLAG_KEY,
          enabled: true,
          targeting_rules: { variant },
          description: "App-wide toast visual style",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      toast.success(`Toast style set to ${variant}`);
      refetchToastStyle();
      refetchFlags();
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setSavingToastStyle(false);
    }
  }

  // App font: one heading face for every user (it used to be a per-user
  // slider). Same row shape as toast_style; enabled: true so the app can read it.
  const { data: appFont, refetch: refetchAppFont } = useQuery({
    queryKey: ["admin", "settings", "app-font"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("targeting_rules")
        .eq("key", APP_FONT_FLAG_KEY)
        .maybeSingle();
      if (error) throw error;
      return (data?.targeting_rules as { font?: string } | null)?.font ?? HEADING_FONT_DEFAULT;
    },
    staleTime: 30_000,
  });
  const [savingAppFont, setSavingAppFont] = useState(false);

  async function setAppFont(font: string) {
    setSavingAppFont(true);
    try {
      const { error } = await supabase.from("feature_flags").upsert(
        {
          key: APP_FONT_FLAG_KEY,
          enabled: true,
          targeting_rules: { font },
          description: "App-wide heading font",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      toast.success("App font saved");
      refetchAppFont();
      refetchFlags();
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setSavingAppFont(false);
    }
  }

  // The two pre-signup intro screens ("why", "how it works"). Read and written
  // as one row so the app's single boot read (src/lib/introScreens.ts) sees a
  // consistent pair. `enabled: true` is load-bearing here too: the anon read
  // policy from migration 20260916000001 is scoped to enabled rows.
  const { data: introScreens, refetch: refetchIntroScreens } = useQuery({
    queryKey: ["admin", "settings", "intro-screens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("targeting_rules")
        .eq("key", "onboarding_intro_screens")
        .maybeSingle();
      if (error) throw error;
      const rules = (data?.targeting_rules as { why?: boolean; how_it_works?: boolean } | null) ?? {};
      return { why: rules.why !== false, howItWorks: rules.how_it_works !== false };
    },
    staleTime: 30_000,
  });
  const [savingIntro, setSavingIntro] = useState(false);

  async function setIntroScreens(next: { why: boolean; howItWorks: boolean }) {
    setSavingIntro(true);
    try {
      const { error } = await supabase.from("feature_flags").upsert(
        {
          key: "onboarding_intro_screens",
          enabled: true,
          targeting_rules: { why: next.why, how_it_works: next.howItWorks },
          description: "Show the Why and How-it-works screens between the story slides and sign-up",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      toast.success("Onboarding intro screens updated (applies on next app launch)");
      refetchIntroScreens();
      refetchFlags();
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setSavingIntro(false);
    }
  }

  async function toggleFlag(key: string, current: boolean) {
    setTogglingKey(key);
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ enabled: !current, updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) throw error;
      toast.success(`${key} ${!current ? "enabled" : "disabled"}`);
      refetchFlags();
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setTogglingKey(null);
    }
  }

  async function saveFunnelWeight(key: string, raw: string) {
    const weight = Math.max(0, Math.min(100, Math.round(Number(raw))));
    if (!Number.isFinite(weight)) return;
    setTogglingKey(key);
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ rollout_pct: weight, updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) throw error;
      toast.success(`${key} weight set to ${weight}`);
      refetchFlags();
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setTogglingKey(null);
    }
  }

  async function promoteByEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = promoteEmail.trim();
    if (!email) return;
    setPromoting(true);
    try {
      // 1. Look up user_id by email
      const lookup = await callEdgeFn<{ user: { id: string; email: string } }>(
        "admin-find-user-by-email",
        { email }
      );
      // 2. Promote to admin
      await callEdgeFn("admin-set-role", {
        targetUserId: lookup.user.id,
        role: "admin",
      });
      toast.success(`${lookup.user.email} is now an admin`);
      setPromoteEmail("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "settings", "admins"] });
    } catch (err) {
      toast.error(`Promote failed: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setPromoting(false);
    }
  }

  async function removeAdmin(adminId: string, adminEmail: string) {
    if (!confirm(`Remove admin role from ${adminEmail}?`)) return;
    setRemovingId(adminId);
    try {
      await callEdgeFn("admin-set-role", { targetUserId: adminId, role: null });
      toast.success(`Removed admin role from ${adminEmail}`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "settings", "admins"] });
    } catch (err) {
      toast.error(`Remove failed: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Feature flags and admin users"
      />

      {/* Feature flags */}
      <ChartCard
        title="Feature Flags"
        description="Toggle features without a deploy — changes apply instantly"
        loading={flagsLoading}
      >
        {!flags?.length ? (
          <EmptyState
            title="No flags defined"
            description="Insert rows into the feature_flags table to manage features here."
          />
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {flags.filter((flag) => !isFunnelFlag(flag.key)).map((flag) => (
              <div key={flag.key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-mono text-white">{flag.key}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Rollout: {flag.rollout_pct}%
                  </p>
                </div>
                <Switch
                  checked={flag.enabled}
                  disabled={togglingKey === flag.key}
                  onCheckedChange={() => toggleFlag(flag.key, flag.enabled)}
                  className="data-[state=checked]:bg-brand-dark"
                />
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      {/* Web funnel variants (depthme site /mindrest) */}
      <ChartCard
        title="Web Funnel Variants"
        description="Enabled variants split /mindrest traffic by weight. All off → variant A. Preview any with /mindrest/<letter>."
        loading={flagsLoading}
      >
        <div className="divide-y divide-white/[0.04]">
          {FUNNEL_VARIANTS.map((v) => {
            const flag = flags?.find((f) => f.key === v.key);
            return (
              <div key={v.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    <span className="font-mono text-brand-light">{v.letter.toUpperCase()}</span> · {v.name}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5 truncate">{v.hint}</p>
                </div>
                {flag ? (
                  <div className="flex shrink-0 items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                      Weight
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={flag.rollout_pct}
                        key={`${v.key}-${flag.rollout_pct}`}
                        disabled={togglingKey === v.key}
                        onBlur={(e) => {
                          if (Number(e.target.value) !== flag.rollout_pct) saveFunnelWeight(v.key, e.target.value);
                        }}
                        className="w-16 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-right text-sm text-white"
                      />
                    </label>
                    <Switch
                      checked={flag.enabled}
                      disabled={togglingKey === v.key}
                      onCheckedChange={() => toggleFlag(v.key, flag.enabled)}
                      className="data-[state=checked]:bg-brand-dark"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-neutral-500">Run migration 20260917000001</span>
                )}
              </div>
            );
          })}
        </div>
      </ChartCard>

      {/* Voice recording script */}
      <ChartCard
        title="Voice Recording Script"
        description="Which explainer users read aloud while cloning their voice (app-wide)"
      >
        <div className="flex gap-2">
          {VOICE_VARIANTS.map((v) => {
            const active = voiceVariant === v.value;
            return (
              <button
                key={v.value}
                onClick={() => setVoiceVariant(v.value)}
                disabled={savingVoice || active}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-3 text-center transition-colors",
                  active
                    ? "border-brand/50 bg-brand/15 text-white"
                    : "border-white/[0.08] bg-[#0d1117] text-neutral-400 hover:text-white hover:border-white/20",
                )}
              >
                <p className="text-sm font-semibold">{v.label}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">{v.hint}</p>
              </button>
            );
          })}
        </div>
      </ChartCard>

      {/* Toast style */}
      <ChartCard
        title="Toast Style"
        description="Visual treatment for in-app toasts (app-wide, applies on next app load)"
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {TOAST_STYLE_OPTIONS.map((s) => {
            const active = (toastStyle ?? DEFAULT_TOAST_STYLE) === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setToastStyle(s.id)}
                disabled={savingToastStyle || active}
                className={cn(
                  "rounded-xl border px-3 py-3 text-center transition-colors",
                  active
                    ? "border-brand/50 bg-brand/15 text-white"
                    : "border-white/[0.08] bg-[#0d1117] text-neutral-400 hover:text-white hover:border-white/20",
                )}
              >
                <p className="text-sm font-semibold">{s.label}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">{s.hint}</p>
              </button>
            );
          })}
        </div>
      </ChartCard>

      {/* App font */}
      <ChartCard
        title="App Font"
        description="The heading typeface every user sees. Applies the next time the app opens; no release needed."
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {HEADING_FONTS.map((f) => {
            const active = (appFont ?? HEADING_FONT_DEFAULT) === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setAppFont(f.id)}
                disabled={savingAppFont || active}
                className={cn(
                  "rounded-xl border px-3 py-3 text-center transition-colors",
                  active
                    ? "border-brand/50 bg-brand/15 text-white"
                    : "border-white/[0.08] bg-[#0d1117] text-neutral-400 hover:text-white hover:border-white/20",
                )}
              >
                <p className="text-lg" style={{ fontFamily: f.stack, fontWeight: f.weight }}>Your ritual</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">{f.label}</p>
              </button>
            );
          })}
        </div>
      </ChartCard>

      {/* Onboarding intro screens */}
      <ChartCard
        title="Onboarding Intro Screens"
        description="The two screens between the story slides and sign-up. Off hides them for every new user on their next launch; no release needed."
      >
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "why" as const, label: "Why Kyriq", hint: "Awareness, reflection, consistency" },
            { id: "howItWorks" as const, label: "How it works", hint: "The four guides and the privacy strip" },
          ]).map((s) => {
            const current = introScreens ?? { why: true, howItWorks: true };
            const on = current[s.id];
            return (
              <button
                key={s.id}
                onClick={() => setIntroScreens({ ...current, [s.id]: !on })}
                disabled={savingIntro}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left transition-colors",
                  on
                    ? "border-brand/50 bg-brand/15 text-white"
                    : "border-white/[0.08] bg-[#0d1117] text-neutral-400 hover:text-white hover:border-white/20",
                )}
              >
                <p className="text-sm font-semibold">{s.label} · {on ? "shown" : "hidden"}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">{s.hint}</p>
              </button>
            );
          })}
        </div>
      </ChartCard>

      {/* Admin users */}
      <ChartCard
        title="Admin Users"
        description={admins?.admins?.length
          ? `${admins.admins.length} ${admins.admins.length === 1 ? 'admin' : 'admins'} with full dashboard access`
          : "Accounts with app_metadata.role = admin"}
        loading={adminsLoading}
      >
        {/* Promote form — pretty styled card */}
        <div className="rounded-xl border border-brand/20 bg-gradient-to-br from-brand/[0.06] to-transparent p-4 mb-5">
          <div className="flex items-center gap-2 mb-2.5">
            <Shield size={13} className="text-brand-light" />
            <p className="text-xs font-medium text-brand">Promote a user</p>
          </div>
          <form onSubmit={promoteByEmail} className="flex gap-2">
            <input
              type="email"
              placeholder="email@example.com"
              value={promoteEmail}
              onChange={(e) => setPromoteEmail(e.target.value)}
              disabled={promoting}
              className="flex-1 h-9 px-3 rounded-md bg-[#0d1117] border border-white/[0.08] text-sm text-white placeholder:text-neutral-600 focus:border-brand/50 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={promoting || !promoteEmail.trim()}
              className="h-9 px-4 rounded-md bg-brand-dark hover:bg-brand disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center gap-1.5 transition-colors shadow-lg shadow-brand/20"
            >
              <UserPlus size={14} />
              {promoting ? "Promoting…" : "Promote"}
            </button>
          </form>
        </div>

        {!admins?.admins?.length ? (
          <EmptyState title="No admin users found" description="Promote a user with the form above." />
        ) : (
          <div className="space-y-1.5">
            {admins.admins.map((admin) => (
              <div key={admin.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.02] transition-colors group">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand/30 to-brand/10 ring-1 ring-brand/30 flex items-center justify-center text-xs text-brand font-semibold shrink-0">
                  {(admin.email?.[0] || "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white truncate">{admin.email}</p>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-brand/30 bg-brand/10 text-brand-light">
                      ADMIN
                    </Badge>
                  </div>
                  <p className="text-[11px] text-neutral-600 font-mono">{admin.id.slice(0, 12)}…</p>
                </div>
                <button
                  onClick={() => removeAdmin(admin.id, admin.email)}
                  disabled={removingId === admin.id}
                  className="h-8 px-2.5 rounded-md text-red-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40 transition-[color,background-color,border-color,box-shadow,opacity,transform] opacity-60 group-hover:opacity-100 flex items-center gap-1.5 text-xs"
                  aria-label={`Remove admin ${admin.email}`}
                >
                  <Trash2 size={13} />
                  {removingId === admin.id ? "Removing…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      {/* Project info */}
      <ChartCard title="Project" description="Supabase project details">
        <div className="space-y-2 text-sm">
          {[
            { icon: <Server size={12} className="text-neutral-500" />, label: "Project ref", value: "qjmamlxsulfxlhddhffp", mono: true },
            { icon: null, label: "Region", value: "East US (Ohio)", mono: false },
            { icon: null, label: "URL", value: "qjmamlxsulfxlhddhffp.supabase.co", mono: true, accent: true },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-1.5">
              <span className="text-neutral-500 inline-flex items-center gap-1.5">{row.icon}{row.label}</span>
              <span className={cn(
                row.mono ? "font-mono text-xs" : "",
                row.accent ? "text-brand-light" : "text-neutral-300",
              )}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}
