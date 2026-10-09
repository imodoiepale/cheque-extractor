'use client';
import React, { createContext, useContext, useState } from "react";
import { subDays, endOfDay, startOfDay } from "date-fns";

type Preset = "24h" | "7d" | "30d" | "90d" | "custom";

interface DateRange {
  from: Date;
  to: Date;
  preset: Preset;
  setPreset: (preset: Preset) => void;
  setCustomRange: (from: Date, to: Date) => void;
}

const DateRangeContext = createContext<DateRange | null>(null);

function rangeFromPreset(preset: Preset): { from: Date; to: Date } {
  const now = new Date();
  const to = endOfDay(now);
  switch (preset) {
    case "24h":
      return { from: subDays(now, 1), to };
    case "7d":
      return { from: startOfDay(subDays(now, 7)), to };
    case "30d":
      return { from: startOfDay(subDays(now, 30)), to };
    case "90d":
      return { from: startOfDay(subDays(now, 90)), to };
    default:
      return { from: startOfDay(subDays(now, 7)), to };
  }
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPresetState] = useState<Preset>("7d");
  const [range, setRange] = useState(rangeFromPreset("7d"));

  const setPreset = (p: Preset) => {
    setPresetState(p);
    setRange(rangeFromPreset(p));
  };

  const setCustomRange = (from: Date, to: Date) => {
    setPresetState("custom");
    setRange({ from, to });
  };

  return (
    <DateRangeContext.Provider
      value={{ ...range, preset, setPreset, setCustomRange }}
    >
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}
