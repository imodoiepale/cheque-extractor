'use client';
import React, { useState } from "react";
import { SideNav } from "./components/SideNav";
import { TopBar } from "./components/TopBar";
import { CommandPalette } from "./components/CommandPalette";
import { MobileTabBar } from "./components/MobileTabBar";
import { useIsMobile } from "@/components/admin-kit/_deps/components/ui/use-mobile";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: React.ReactNode;
  /** Mounted inside the consumer app rather than at /admin — see AdminApp. */
  embedded?: boolean;
}

export function AdminLayout({ children, embedded = false }: AdminLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div
      className={cn(
        "bg-[#0b0f14] font-sans text-neutral-100",
        // Standalone, the document scrolls and min-h-screen is right.
        // Embedded, it is NOT: the consumer app's shell is `position: fixed;
        // inset: 0` so the document has nothing to scroll, and admin content
        // taller than the frame simply had nowhere to go. Owning a scrollport
        // is what makes the embedded admin scrollable at all.
        embedded ? "h-full overflow-y-auto overscroll-contain" : "min-h-screen"
      )}
    >
      <CommandPalette />
      {!isMobile && (
        <SideNav
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
        />
      )}
      <div
        className={cn(
          "flex flex-col",
          !isMobile && (sidebarCollapsed ? "ml-16" : "ml-60")
        )}
      >
        <TopBar />
        <main
          className={cn(
            "mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6",
            isMobile && "pb-20"
          )}
        >
          {children}
        </main>
      </div>
      {isMobile && <MobileTabBar />}
    </div>
  );
}
