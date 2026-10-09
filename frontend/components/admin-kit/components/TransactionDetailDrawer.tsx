'use client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/admin-kit/_deps/components/ui/sheet";
import { Badge } from "@/components/admin-kit/_deps/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "../lib/formatters";
import { cn } from "@/lib/utils";

// A Stripe charge as returned live from admin-stripe-query (superset — all optional
// so the drawer works with whatever the API returned).
export interface ChargeLike {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  refunded?: boolean;
  disputed?: boolean;
  description?: string | null;
  receipt_email?: string | null;
  receipt_url?: string | null;
  customer?: { id?: string; email?: string | null; name?: string | null } | string | null;
  billing_details?: { email?: string | null; name?: string | null } | null;
  failure_code?: string | null;
  failure_message?: string | null;
  outcome?: { type?: string; reason?: string | null; seller_message?: string | null; network_status?: string | null } | null;
  payment_method_details?: { type?: string; card?: { brand?: string; last4?: string; funding?: string; country?: string } } | null;
  metadata?: Record<string, string> | null;
}

/** Human-readable failure reason for a failed/declined charge. */
export function failureReason(c: ChargeLike): string | null {
  if (c.status === "succeeded") return null;
  return c.outcome?.seller_message || c.failure_message || c.outcome?.reason || c.failure_code || null;
}

function emailOf(c: ChargeLike): string {
  const exp = typeof c.customer === "object" && c.customer !== null ? c.customer.email : null;
  return exp || c.receipt_email || c.billing_details?.email || "—";
}

const statusStyle: Record<string, string> = {
  succeeded: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  refunded: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-neutral-500 shrink-0">{label}</span>
      <span className={cn("text-sm text-neutral-200 text-right break-all", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

export function TransactionDetailDrawer({ charge, open, onClose }: { charge: ChargeLike | null; open: boolean; onClose: () => void }) {
  if (!charge) return null;
  const status = charge.refunded ? "refunded" : charge.status;
  const reason = failureReason(charge);
  const card = charge.payment_method_details?.card;
  const method = charge.payment_method_details?.type || (card ? "card" : undefined);
  const dt = new Date(charge.created * 1000);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto p-0 bg-[#0b0e14] border-white/[0.06]">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <SheetTitle className="text-white flex items-center gap-3">
            {formatCurrency(charge.amount / 100)} {charge.currency.toUpperCase()}
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium border", statusStyle[status] ?? "bg-white/[0.04] text-neutral-400 border-white/[0.08]")}>
              {status}
            </span>
          </SheetTitle>
          <p className="text-xs text-neutral-500">{emailOf(charge)}</p>
        </SheetHeader>

        <div className="p-6 space-y-5">
          {reason && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-red-400/80 mb-1">Why it failed</p>
              <p className="text-sm text-red-200">{reason}</p>
              {(charge.failure_code || charge.outcome?.reason) && (
                <p className="text-[11px] text-red-300/60 font-mono mt-1">{charge.failure_code || charge.outcome?.reason}</p>
              )}
            </div>
          )}

          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Details</p>
            <Row label="Date" value={format(dt, "MMM d, yyyy 'at' h:mm:ss a")} />
            <Row label="Amount" value={`${formatCurrency(charge.amount / 100)} ${charge.currency.toUpperCase()}`} />
            <Row label="Status" value={status} />
            <Row label="Payment method" value={method ? (card ? `${card.brand ?? method} ···· ${card.last4 ?? "????"}` : method) : undefined} />
            <Row label="Card funding" value={card?.funding} />
            <Row label="Card country" value={card?.country} />
            <Row label="Network status" value={charge.outcome?.network_status} />
            <Row label="Risk outcome" value={charge.outcome?.type} />
            <Row label="Description" value={charge.description ?? undefined} />
            <Row label="Customer" value={emailOf(charge)} />
            <Row label="Charge ID" value={charge.id} mono />
          </div>

          {charge.metadata && Object.keys(charge.metadata).length > 0 && (
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Metadata</p>
              {Object.entries(charge.metadata).map(([k, v]) => (
                <Row key={k} label={k} value={String(v)} mono />
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {charge.receipt_url && (
              <a href={charge.receipt_url} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-neutral-300 hover:bg-white/[0.06]">
                Receipt <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <a href={`https://dashboard.stripe.com/payments/${charge.id}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300 hover:bg-indigo-500/20">
              Open in Stripe <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
