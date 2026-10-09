'use client';

/**
 * Super-admin console shell, ported from DepthMe's admin (see
 * components/admin-kit, produced by the port-admin-console skill).
 *
 * The client gate here is cosmetic: every admin API re-verifies the session
 * server-side (pages/api/admin/fn/[name].ts and the older pages/api/admin/*).
 * The console is dark-only, like DepthMe's; `.dark` re-points Kyriq's tokens so
 * the native Kyriq screens (Firms, Firms & billing, OCR Lab) match it.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { adminQueryClient } from '@/components/admin-kit/lib/queryClient';
import { DateRangeProvider } from '@/components/admin-kit/contexts/DateRangeContext';
import { RequireAdmin } from '@/components/admin-kit/components/RequireAdmin';
import { AdminLayout } from '@/components/admin-kit/AdminLayout';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark">
      <QueryClientProvider client={adminQueryClient}>
        <DateRangeProvider>
          <RequireAdmin>
            <AdminLayout>{children}</AdminLayout>
          </RequireAdmin>
          <Toaster position="top-right" richColors theme="dark" />
        </DateRangeProvider>
      </QueryClientProvider>
    </div>
  );
}
