"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { useToast } from "../_components/Toast";
import { Badge } from "../_components/Badge";
import { Button } from "../_components/Button";
import { SkeletonCard } from "../_components/Skeleton";
import { EmptyState } from "../_components/EmptyState";
import { formatKES, nairobiDayStartISO, nairobiHour } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";

type TabRow = Database["public"]["Tables"]["tabs"]["Row"];
type TableRow = Database["public"]["Tables"]["tables"]["Row"];
type TabTotal = Database["public"]["Views"]["tab_totals"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];

type OrderItemToday = {
  quantity: number;
  unit_price: number;
  products: { name: string } | null;
  orders: { tabs: { status: string } | null } | null;
};

function greeting(): string {
  const hour = nairobiHour();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const session = useStaffSession();
  const toast = useToast();
  const isAdmin = session?.staff_role === "admin";

  const [loading, setLoading] = useState(true);
  const [todayCash, setTodayCash] = useState(0);
  const [todayMpesa, setTodayMpesa] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [openTabs, setOpenTabs] = useState<TabRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [totals, setTotals] = useState<Record<string, TabTotal>>({});
  const [topSellers, setTopSellers] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [todaySales, setTodaySales] = useState(0);
  const [lowStock, setLowStock] = useState<ProductRow[]>([]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const supabase = getSupabaseClient();
      const dayStart = nairobiDayStartISO();
      try {
        const [paymentsResult, tabsResult, tablesResult, itemsResult] = await Promise.all([
          supabase.from("payments").select("amount, method").eq("status", "completed").gte("completed_at", dayStart),
          supabase.from("tabs").select("*").in("status", ["open", "pending_payment"]).order("opened_at", { ascending: false }),
          supabase.from("tables").select("*").eq("is_active", true).order("label"),
          fetchAllRows<OrderItemToday>(
            (from, to) =>
              supabase
                .from("order_items")
                .select("quantity, unit_price, products(name), orders!inner(tabs!inner(status))")
                .eq("line_status", "active")
                .gte("created_at", dayStart)
                .range(from, to) as unknown as PromiseLike<{ data: OrderItemToday[] | null; error: { message: string } | null }>
          ),
        ]);
        if (paymentsResult.error) throw new Error(paymentsResult.error.message);
        if (tabsResult.error) throw new Error(tabsResult.error.message);

        const payments = paymentsResult.data ?? [];
        setTodayCash(payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0));
        setTodayMpesa(payments.filter((p) => p.method === "mpesa").reduce((s, p) => s + p.amount, 0));
        setPaymentCount(payments.length);

        const tabs = tabsResult.data ?? [];
        setOpenTabs(tabs);
        setTables(tablesResult.data ?? []);
        if (tabs.length > 0) {
          const { data: totalRows } = await supabase
            .from("tab_totals")
            .select("*")
            .in("tab_id", tabs.map((t) => t.id));
          setTotals(Object.fromEntries((totalRows ?? []).map((t) => [t.tab_id as string, t])));
        }

        const activeItems = itemsResult.filter((i) => i.orders?.tabs?.status !== "voided");
        setTodaySales(activeItems.reduce((s, i) => s + i.quantity * i.unit_price, 0));
        const byProduct = new Map<string, { qty: number; revenue: number }>();
        for (const i of activeItems) {
          const name = i.products?.name ?? "Unknown";
          const existing = byProduct.get(name) ?? { qty: 0, revenue: 0 };
          existing.qty += i.quantity;
          existing.revenue += i.quantity * i.unit_price;
          byProduct.set(name, existing);
        }
        setTopSellers(
          Array.from(byProduct.entries())
            .map(([name, v]) => ({ name, ...v }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)
        );

        if (isAdmin) {
          const products = await fetchAllRows<ProductRow>((from, to) =>
            supabase.from("products").select("*").eq("track_stock", true).range(from, to)
          );
          setLowStock(products.filter((p) => p.stock_qty <= p.low_stock_threshold).sort((a, b) => a.stock_qty - b.stock_qty));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't load dashboard");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isAdmin]);

  if (!session) return null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {greeting()}, {session.staff_name.split(" ")[0]}
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">Here&apos;s what&apos;s happening today.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/tabs">
          <Button>Open a tab</Button>
        </Link>
        {isAdmin && (
          <Link href="/admin/products">
            <Button variant="secondary">Add product</Button>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Today&apos;s revenue</p>
            <p className="tabular mt-1 text-2xl font-semibold text-brand-700 dark:text-brand-300">
              {formatKES(todayCash + todayMpesa)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {formatKES(todayCash)} cash · {formatKES(todayMpesa)} M-Pesa · {paymentCount} payment
              {paymentCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Open tabs</p>
            <p className="tabular mt-1 text-2xl font-semibold text-accent-700 dark:text-accent-400">{openTabs.length}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {formatKES(Object.values(totals).reduce((s, t) => s + t.balance, 0))} outstanding
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Today&apos;s sales</p>
            <p className="tabular mt-1 text-2xl font-semibold">{formatKES(todaySales)}</p>
            <p className="mt-1 text-xs text-ink-muted">Items sold, including unpaid open tabs</p>
          </div>
        </section>
      )}

      {isAdmin && !loading && lowStock.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Low stock</h2>
            <Badge variant="warning">{lowStock.length}</Badge>
          </div>
          <div className="flex flex-col gap-1.5">
            {lowStock.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span>
                  {p.name}
                  {p.size && <span className="text-ink-muted"> ({p.size})</span>}
                </span>
                <span className="tabular font-medium text-amber-700 dark:text-amber-400">{p.stock_qty} left</span>
              </div>
            ))}
          </div>
          <Link href="/admin/inventory?low=1" className="mt-3 inline-block text-sm text-brand-600 hover:underline dark:text-brand-400">
            Manage inventory &rarr;
          </Link>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
          <h2 className="mb-3 text-sm font-semibold text-ink-muted">Open tabs</h2>
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-line" />
              ))}
            </div>
          ) : openTabs.length === 0 ? (
            <EmptyState title="No open tabs" hint="Open one to start taking orders." />
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {openTabs.slice(0, 6).map((tab) => {
                const table = tables.find((t) => t.id === tab.table_id);
                return (
                  <Link
                    key={tab.id}
                    href={`/tabs/${tab.id}`}
                    className="flex items-center justify-between py-2 text-sm transition-colors hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    <span>{table?.label ?? tab.label ?? "Tab"}</span>
                    <span className="tabular text-ink-muted">{formatKES(totals[tab.id]?.balance ?? 0)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
          <h2 className="mb-3 text-sm font-semibold text-ink-muted">Top sellers today</h2>
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-line" />
              ))}
            </div>
          ) : topSellers.length === 0 ? (
            <EmptyState title="No sales yet today" />
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {topSellers.map((s) => (
                <div key={s.name} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {s.name} <span className="text-ink-muted">&times;{s.qty}</span>
                  </span>
                  <span className="tabular text-ink-muted">{formatKES(s.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
