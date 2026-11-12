"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { RequireAdmin } from "../_components/RequireAdmin";
import { useToast } from "../_components/Toast";
import { Button } from "../_components/Button";
import { Input } from "../_components/Field";
import { PageHeader } from "../_components/PageHeader";
import { SkeletonCard } from "../_components/Skeleton";
import { EmptyState } from "../_components/EmptyState";
import { formatKES, nairobiDateString, nairobiDayEndISO, nairobiDayStartISO, shiftDateString } from "@/lib/format";

type OrderItemReport = {
  quantity: number;
  unit_price: number;
  products: { name: string; categories: { name: string } | null } | null;
  orders: { tabs: { status: string } | null } | null;
};

type PaymentReport = {
  amount: number;
  method: "cash" | "mpesa";
};

function weekStart(dateStr: string): string {
  // Nairobi weekday: anchor at noon +03:00 so UTC date math never crosses
  // the local day boundary.
  const d = new Date(`${dateStr}T12:00:00+03:00`);
  const dow = d.getUTCDay(); // 0 = Sunday
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return shiftDateString(dateStr, mondayOffset);
}

function monthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function ReportsContent() {
  const toast = useToast();
  const today = nairobiDateString();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [items, setItems] = useState<OrderItemReport[]>([]);
  const [payments, setPayments] = useState<PaymentReport[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(fromDate: string, toDate: string) {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const startIso = nairobiDayStartISO(fromDate);
      const endIso = nairobiDayEndISO(toDate);
      const [itemRows, paymentRows] = await Promise.all([
        fetchAllRows<OrderItemReport>(
          (from_, to_) =>
            supabase
              .from("order_items")
              .select("quantity, unit_price, products(name, categories(name)), orders!inner(tabs!inner(status))")
              .eq("line_status", "active")
              .gte("created_at", startIso)
              .lte("created_at", endIso)
              .range(from_, to_) as unknown as PromiseLike<{ data: OrderItemReport[] | null; error: { message: string } | null }>
        ),
        fetchAllRows<PaymentReport>((from_, to_) =>
          supabase
            .from("payments")
            .select("amount, method")
            .eq("status", "completed")
            .gte("completed_at", startIso)
            .lte("completed_at", endIso)
            .range(from_, to_)
        ),
      ]);
      // Voiding a tab doesn't void its individual order lines, so exclude
      // voided tabs' items here rather than trusting line_status alone.
      setItems(itemRows.filter((i) => i.orders?.tabs?.status !== "voided"));
      setPayments(paymentRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(f: string, t: string) {
    setFrom(f);
    setTo(t);
    load(f, t);
  }

  const salesTotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const cashCollected = payments.filter((p) => p.method === "cash").reduce((sum, p) => sum + p.amount, 0);
  const mpesaCollected = payments.filter((p) => p.method === "mpesa").reduce((sum, p) => sum + p.amount, 0);

  const categoryTotals = new Map<string, number>();
  for (const i of items) {
    const name = i.products?.categories?.name ?? "Uncategorized";
    categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + i.quantity * i.unit_price);
  }
  const categoryRows = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(1, ...categoryRows.map(([, v]) => v));

  const productTotals = new Map<string, { qty: number; revenue: number }>();
  for (const i of items) {
    const name = i.products?.name ?? "Unknown";
    const existing = productTotals.get(name) ?? { qty: 0, revenue: 0 };
    existing.qty += i.quantity;
    existing.revenue += i.quantity * i.unit_price;
    productTotals.set(name, existing);
  }
  const topProducts = Array.from(productTotals.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8);
  const maxProduct = Math.max(1, ...topProducts.map(([, v]) => v.revenue));

  const presetClass = "rounded-full px-3 py-1 text-xs font-medium bg-surface-sunken text-ink-muted hover:text-foreground transition-colors";

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Reports" subtitle="Sales and payments for the selected date range (East Africa Time)." />

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <div className="mb-3 flex flex-wrap gap-2">
          <button className={presetClass} onClick={() => applyPreset(today, today)}>
            Today
          </button>
          <button className={presetClass} onClick={() => applyPreset(shiftDateString(today, -1), shiftDateString(today, -1))}>
            Yesterday
          </button>
          <button className={presetClass} onClick={() => applyPreset(weekStart(today), today)}>
            This week
          </button>
          <button className={presetClass} onClick={() => applyPreset(monthStart(today), today)}>
            This month
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button loading={loading} onClick={() => load(from, to)}>
            Refresh
          </Button>
        </div>
      </section>

      {loading ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Sales recognized</p>
            <p className="tabular mt-1 text-2xl font-semibold text-brand-700 dark:text-brand-300">{formatKES(salesTotal)}</p>
            <p className="mt-1 text-xs text-ink-muted">From order items, including unpaid open tabs</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Cash collected</p>
            <p className="tabular mt-1 text-2xl font-semibold text-accent-700 dark:text-accent-400">{formatKES(cashCollected)}</p>
            <p className="mt-1 text-xs text-ink-muted">Completed cash payments only</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">M-Pesa collected</p>
            <p className="tabular mt-1 text-2xl font-semibold text-accent-700 dark:text-accent-400">{formatKES(mpesaCollected)}</p>
            <p className="mt-1 text-xs text-ink-muted">Completed M-Pesa payments only</p>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-sm font-semibold text-ink-muted">Revenue by category</h2>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-2 animate-pulse rounded-full bg-line" />
            ))}
          </div>
        ) : categoryRows.length === 0 ? (
          <EmptyState title="No sales in this range" />
        ) : (
          <div className="flex flex-col gap-3">
            {categoryRows.map(([name, value]) => (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{name}</span>
                  <span className="tabular text-ink-muted">{formatKES(value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(value / maxCategory) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-sm font-semibold text-ink-muted">Top products</h2>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-2 animate-pulse rounded-full bg-line" />
            ))}
          </div>
        ) : topProducts.length === 0 ? (
          <EmptyState title="No sales in this range" />
        ) : (
          <div className="flex flex-col gap-3">
            {topProducts.map(([name, { qty, revenue }]) => (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>
                    {name} <span className="text-ink-muted">&times;{qty}</span>
                  </span>
                  <span className="tabular text-ink-muted">{formatKES(revenue)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-accent-500" style={{ width: `${(revenue / maxProduct) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <RequireAdmin>
      <ReportsContent />
    </RequireAdmin>
  );
}
