'use client';
import React, { useEffect } from "react";
import { useNavigate } from "@/components/admin-kit/shim/router";
import { useAuth } from "@/components/admin-kit/shim/auth";
import { toast } from "sonner";

interface RequireAdminProps {
  children: React.ReactNode;
  permission?: string;
}

export function RequireAdmin({ children, permission: _permission }: RequireAdminProps) {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error("Admin access required");
      window.location.href = "/";
    }
  }, [isAdmin, loading, navigate]);

  if (loading) {
    return <div className="h-screen bg-[#070B16]" aria-hidden="true" />;
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
