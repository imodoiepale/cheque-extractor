'use client';
import React from "react";
import { NavLink } from "@/components/admin-kit/shim/router";
import {
  LayoutDashboard,
  DollarSign,
  Users,
  BarChart2,
  Shield,
  TrendingUp,
  Settings,
  Server,
  FileText,
  Zap,
  ChevronLeft,
  ChevronRight,
  Tag,
  ArrowLeft,
  Activity,
  Receipt,
  Calculator,
  MailCheck,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "../lib/nav";

import { Button } from "@/components/admin-kit/_deps/components/ui/button";

const navItems = ADMIN_NAV;

interface SideNavProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function SideNav({ collapsed, onToggle }: SideNavProps) {
  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-40 flex h-screen flex-col border-r border-white/[0.06] bg-[#0d1117]",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-white/[0.06] px-4">
        {!collapsed && (
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/kyriq-logo-white.svg" alt="Kyriq" height={24} width={58} className="h-6 w-auto" />
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-light">Admin</span>
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "ml-auto h-7 w-7 text-neutral-400 hover:text-white",
            collapsed && "mx-auto"
          )}
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-brand/10 text-brand-light"
                  : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-100"
              )
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-2 border-t border-white/[0.06] p-3">
        <a
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-white/[0.04] hover:text-neutral-100",
            collapsed && "justify-center"
          )}
          title="Back to App"
        >
          <ArrowLeft className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Back to App</span>}
        </a>
        {!collapsed && (
          <div className="px-3 text-xs text-neutral-600">
            Kyriq super admin
          </div>
        )}
      </div>
    </aside>
  );
}
