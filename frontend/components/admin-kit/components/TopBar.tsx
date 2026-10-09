'use client';
import React from "react";
import { Search, Bell } from "lucide-react";
import { Button } from "@/components/admin-kit/_deps/components/ui/button";
import { UserMenu } from "./UserMenu";
import { useDateRange } from "../contexts/DateRangeContext";
import { useCommandPalette } from "../lib/commands";

export function TopBar() {
  const { preset, setPreset } = useDateRange();
  const { open } = useCommandPalette();

  const presets = ["24h", "7d", "30d", "90d"] as const;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-[#0b0f14]/80 backdrop-blur px-6">
      {/* Search / palette trigger */}
      <button
        onClick={open}
        className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-300 transition-colors w-52"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-mono sm:block">
          ⌘K
        </kbd>
      </button>

      {/* Date range presets — hidden on mobile to prevent overflow */}
      <div className="hidden md:flex items-center gap-1">
        {presets.map((p) => (
          <Button
            key={p}
            variant="ghost"
            size="sm"
            onClick={() => setPreset(p)}
            className={`h-7 px-2 text-xs ${
              preset === p
                ? "bg-brand/10 text-brand-light"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {p}
          </Button>
        ))}
        {preset !== "7d" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreset("7d")}
            className="h-7 px-1.5 text-xs text-neutral-600 hover:text-neutral-300"
            title="Reset to default (7d)"
          >
            ✕
          </Button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-neutral-400 hover:text-white"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
