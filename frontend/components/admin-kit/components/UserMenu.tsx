'use client';
import React from "react";
import { LogOut, User, ArrowLeft } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/admin-kit/_deps/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/admin-kit/_deps/components/ui/avatar";
import { useAuth } from "@/components/admin-kit/shim/auth";

export function UserMenu() {
  const { user, signOut } = useAuth();

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "AD";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg p-1 hover:bg-white/[0.04] transition-colors">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-brand/20 text-brand-light text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-[#12171d] border-white/[0.08]">
        <div className="px-2 py-1.5">
          <p className="text-xs text-neutral-400 truncate">{user?.email}</p>
        </div>
        <DropdownMenuSeparator className="bg-white/[0.06]" />
        <DropdownMenuItem
          onClick={() => { window.location.href = '/'; }}
          className="text-neutral-300 focus:text-white focus:bg-white/[0.06] cursor-pointer"
        >
          <ArrowLeft className="mr-2 h-3.5 w-3.5" />
          Back to App
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/[0.06]" />
        <DropdownMenuItem className="text-neutral-500 focus:text-neutral-400 focus:bg-white/[0.06] cursor-default" disabled>
          <User className="mr-2 h-3.5 w-3.5" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/[0.06]" />
        <DropdownMenuItem
          onClick={signOut}
          className="text-red-400 focus:text-red-300 focus:bg-red-500/[0.06] cursor-pointer"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
