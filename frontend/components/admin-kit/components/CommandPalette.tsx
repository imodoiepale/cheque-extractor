'use client';
import React, { useCallback, useEffect } from "react";
import { useNavigate } from "@/components/admin-kit/shim/router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/admin-kit/_deps/components/ui/command";
import { useCommandPalette } from "../lib/commands";
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
  Calculator,
} from "lucide-react";
import { ADMIN_NAV } from "../lib/nav";

const navCommands = ADMIN_NAV;

export function CommandPalette() {
  const { isOpen, open, close } = useCommandPalette();
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  const run = useCallback(
    (to: string) => {
      navigate(to);
      close();
    },
    [navigate, close]
  );

  return (
    <CommandDialog open={isOpen} onOpenChange={(v) => (v ? open() : close())}>
      <CommandInput placeholder="Search pages, users, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navCommands.map(({ label, icon: Icon, to }) => (
            <CommandItem key={to} onSelect={() => run(to)}>
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
