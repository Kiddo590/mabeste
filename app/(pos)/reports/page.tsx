"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type OrderItemReport = {
  quantity: number;
  unit_price: number;
  products: { name: string; categories: { name: string } | null } | null;
};

type PaymentReport = {
  amount: number;
  method: "cash" | "mpesa";
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [items, setItems] = useState<OrderItemReport[]>([]);
  const [payments, setPayments] = useState<PaymentReport[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = getSupabaseClient();
      const startIso = new Date(`${from}T00:00:00`).toISOString();
      const endIso = new Date(`${to}T23:59:59.999`).toISOString();
      const [{ data: itemRows, error: itemError }, { data: paymentRows, error: paymentError }] = await Promise.all([
        supabase
          .from("order_items")
          .select("quantity, unit_price, products(name, categories(name))")
          .eq("line_status", "active")
          .gte("created_at", startIso)
          .lte("created_at", endIso),
        supabase
          .from("payments")
          .select("amount, method")
          .eq("status", "completed")
          .gte("completed_at", startIso)
          .lte("completed_at", endIso),
      ]);
      if (itemError || paymentError) {
        setLoadError(itemError?.message ?? paymentError?.message ?? "Failed to load report");
        return;
      }
      setItems((itemRows ?? []) as unknown as OrderItemReport[]);
      setPayments((paymentRows ?? []) as unknown as PaymentReport[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border border-black/10 px-3 py-2 text-sm focus:border-brand-500/50 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:focus:border-brand-400/40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded border border-black/10 px-3 py-2 text-sm focus:border-brand-500/50 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:focus:border-brand-400/40"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50 dark:bg-accent-500 dark:text-black dark:hover:bg-accent-400"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {loadError && <p className="mt-3 text-red-600">{loadError}</p>}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sales recognized</p>
          <p className="mt-1 text-2xl font-semibold text-brand-700 dark:text-brand-300">KES {salesTotal.toFixed(2)}</p>
          <p className="mt-1 text-xs text-zinc-400">From order items, including unpaid open tabs</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Cash collected</p>
          <p className="mt-1 text-2xl font-semibold text-accent-700 dark:text-accent-400">KES {cashCollected.toFixed(2)}</p>
          <p className="mt-1 text-xs text-zinc-400">Completed cash payments only</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">M-Pesa collected</p>
          <p className="mt-1 text-2xl font-semibold">KES {mpesaCollected.toFixed(2)}</p>
          <p className="mt-1 text-xs text-zinc-400">No M-Pesa integration yet — always 0</p>
        </div>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-semibold text-zinc-500">Revenue by category</h2>
        {categoryRows.length === 0 ? (
          <p className="text-sm text-zinc-500">No sales in this range.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {categoryRows.map(([name, value]) => (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{name}</span>
                  <span className="text-zinc-500">KES {value.toFixed(2)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(value / maxCategory) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-semibold text-zinc-500">Top products</h2>
        {topProducts.length === 0 ? (
          <p className="text-sm text-zinc-500">No sales in this range.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {topProducts.map(([name, { qty, revenue }]) => (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>
                    {name} <span className="text-zinc-400">&times;{qty}</span>
                  </span>
                  <span className="text-zinc-500">KES {revenue.toFixed(2)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
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
