"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import type { Database } from "@/lib/supabase/types";

type TabRow = Database["public"]["Tables"]["tabs"]["Row"] & { tables: { label: string } | null };
type TabTotal = Database["public"]["Views"]["tab_totals"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

type OrderItemWithJoins = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  line_status: "active" | "voided";
  products: { name: string; image_url: string | null } | null;
  orders: { created_by: string } | null;
};

type GroupedLine = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  canVoid: boolean;
};

function TabDetailContent() {
  const { tabId } = useParams<{ tabId: string }>();
  const router = useRouter();
  const session = useStaffSession();

  const [tab, setTab] = useState<TabRow | null>(null);
  const [total, setTotal] = useState<TabTotal | null>(null);
  const [items, setItems] = useState<OrderItemWithJoins[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  async function loadAll() {
    const supabase = getSupabaseClient();
    const [
      { data: tabRow, error: tabError },
      { data: totalRow, error: totalError },
      { data: itemRows, error: itemError },
      { data: productRows, error: productError },
      { data: categoryRows, error: categoryError },
    ] = await Promise.all([
      supabase.from("tabs").select("*, tables(label)").eq("id", tabId).single(),
      supabase.from("tab_totals").select("*").eq("tab_id", tabId).maybeSingle(),
      supabase
        .from("order_items")
        .select("*, products(name, image_url), orders!inner(tab_id, created_by)")
        .eq("orders.tab_id", tabId)
        .eq("line_status", "active")
        .order("created_at"),
      supabase.from("products").select("*").eq("is_active", true).order("name"),
      supabase.from("categories").select("*").order("sort_order"),
    ]);
    if (tabError || totalError || itemError || productError || categoryError) {
      setLoadError(
        tabError?.message ??
          totalError?.message ??
          itemError?.message ??
          productError?.message ??
          categoryError?.message ??
          "Failed to load tab"
      );
      return;
    }
    setTab(tabRow as unknown as TabRow);
    setTotal(totalRow);
    setItems((itemRows ?? []) as unknown as OrderItemWithJoins[]);
    setProducts(productRows ?? []);
    setCategories(categoryRows ?? []);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  async function getOrCreateMyOrder(): Promise<string> {
    if (!session) throw new Error("Not logged in");
    const supabase = getSupabaseClient();
    const { data: existing, error: findError } = await supabase
      .from("orders")
      .select("id")
      .eq("tab_id", tabId)
      .eq("created_by", session.staff_id)
      .eq("status", "open")
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (existing) return existing.id;

    const newOrderId = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from("orders")
      .insert({ id: newOrderId, tab_id: tabId, created_by: session.staff_id, status: "open" });
    if (insertError) throw new Error(insertError.message);
    return newOrderId;
  }

  // Every add is a fresh order_items row, even for a product already on the
  // tab — never an update to an existing line. That keeps void/edit
  // permissions scoped per-order (via order_items_update's RLS, which checks
  // orders.created_by) without needing a staff column on order_items itself.
  async function addItem(product: ProductRow) {
    if (!session) return;
    setBusy(true);
    setActionError(null);
    try {
      const orderId = await getOrCreateMyOrder();
      const supabase = getSupabaseClient();
      const itemId = crypto.randomUUID();
      const { error: itemError } = await supabase.from("order_items").insert({
        id: itemId,
        order_id: orderId,
        product_id: product.id,
        quantity: 1,
        unit_price: product.price,
        line_status: "active",
      });
      if (itemError) throw new Error(itemError.message);

      if (product.track_stock) {
        const { error: stockError } = await supabase.from("stock_movements").insert({
          id: crypto.randomUUID(),
          product_id: product.id,
          change_qty: -1,
          reason: "sale",
          order_item_id: itemId,
          staff_id: session.staff_id,
        });
        if (stockError) throw new Error(stockError.message);
      }
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  async function voidOneUnit(productId: string) {
    const item = items.find((i) => i.product_id === productId && i.line_status === "active");
    if (!item || !session) return;
    setBusy(true);
    setActionError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: voidError } = await supabase
        .from("order_items")
        .update({ line_status: "voided" })
        .eq("id", item.id);
      if (voidError) throw new Error(voidError.message);

      const product = products.find((p) => p.id === item.product_id);
      if (product?.track_stock) {
        const { error: stockError } = await supabase.from("stock_movements").insert({
          id: crypto.randomUUID(),
          product_id: item.product_id,
          change_qty: item.quantity,
          reason: "void_return",
          order_item_id: item.id,
          staff_id: session.staff_id,
        });
        if (stockError) throw new Error(stockError.message);
      }
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to void item");
    } finally {
      setBusy(false);
    }
  }

  // payments' auto-close trigger is AFTER UPDATE, not INSERT — a payment
  // must land as 'pending' first, then transition to 'completed', or the
  // tab never auto-closes.
  async function recordCashPayment() {
    if (!total || total.balance <= 0 || !session) return;
    setBusy(true);
    setActionError(null);
    try {
      const supabase = getSupabaseClient();
      const paymentId = crypto.randomUUID();
      const { error: insertError } = await supabase.from("payments").insert({
        id: paymentId,
        tab_id: tabId,
        method: "cash",
        amount: total.balance,
        status: "pending",
        recorded_by: session.staff_id,
      });
      if (insertError) throw new Error(insertError.message);

      const { error: updateError } = await supabase
        .from("payments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", paymentId);
      if (updateError) throw new Error(updateError.message);

      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  async function voidTab() {
    if (!tab || !session || session.staff_role !== "admin") return;
    if (!confirm("Void this entire tab? This cannot be undone.")) return;
    setBusy(true);
    setActionError(null);
    try {
      const { error } = await getSupabaseClient().rpc("update_tab_status", {
        p_tab_id: tab.id,
        p_expected_version: tab.version,
        p_new_status: "voided",
        p_closed_by: session.staff_id,
      });
      if (error) throw new Error(error.message);
      router.push("/tabs");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to void tab");
    } finally {
      setBusy(false);
    }
  }

  // Merge same-product active lines for display only — the DB keeps every
  // tap as its own row so void permissions stay scoped per-order.
  const groupedItems = useMemo<GroupedLine[]>(() => {
    const map = new Map<string, GroupedLine>();
    for (const item of items) {
      const mine = !!session && (item.orders?.created_by === session.staff_id || session.staff_role === "admin");
      const existing = map.get(item.product_id);
      if (existing) {
        existing.quantity += item.quantity;
        existing.canVoid = existing.canVoid && mine;
      } else {
        map.set(item.product_id, {
          product_id: item.product_id,
          name: item.products?.name ?? "Unknown",
          quantity: item.quantity,
          unit_price: item.unit_price,
          canVoid: mine,
        });
      }
    }
    return Array.from(map.values());
  }, [items, session]);

  const visibleProducts = categoryFilter ? products.filter((p) => p.category_id === categoryFilter) : products;

  if (!tab) {
    return <div className="p-6 text-sm text-zinc-500">{loadError ?? "Loading..."}</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pb-40 md:pb-24 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/tabs" className="text-sm text-zinc-500 hover:text-brand-600 dark:hover:text-brand-400">
            &larr; Tabs
          </Link>
          <h1 className="text-lg font-semibold">{tab.tables?.label ?? tab.label ?? "Tab"}</h1>
          <p className="text-sm text-zinc-500">{tab.status === "pending_payment" ? "Awaiting payment" : "Open"}</p>
        </div>
        {session?.staff_role === "admin" && (
          <button
            onClick={voidTab}
            disabled={busy}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Void tab
          </button>
        )}
      </div>
      {actionError && <p className="text-red-600">{actionError}</p>}
      {loadError && <p className="text-red-600">{loadError}</p>}

      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-500">Order</h2>
        {groupedItems.length === 0 ? (
          <p className="text-sm text-zinc-500">No items yet — add from the menu below.</p>
        ) : (
          <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
            {groupedItems.map((g) => (
              <div key={g.product_id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {g.quantity}&times; {g.name}
                </span>
                <span className="shrink-0 text-sm text-zinc-500">KES {(g.quantity * g.unit_price).toFixed(2)}</span>
                {g.canVoid && (
                  <button
                    onClick={() => voidOneUnit(g.product_id)}
                    disabled={busy}
                    className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Void 1
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-black/10 pt-3 text-sm dark:border-white/10">
          <span className="text-zinc-500">Paid</span>
          <span>KES {(total?.paid_total ?? 0).toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Balance</span>
          <span className="text-brand-700 dark:text-brand-300">KES {(total?.balance ?? 0).toFixed(2)}</span>
        </div>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !categoryFilter ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                categoryFilter === c.id ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleProducts.map((p) => (
            <button
              key={p.id}
              onClick={() => addItem(p)}
              disabled={busy}
              className="flex flex-col items-start gap-1 rounded-xl border border-black/10 p-3 text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-50 dark:border-white/10"
            >
              <span className="w-full truncate text-sm font-medium">{p.name}</span>
              <span className="text-xs text-zinc-500">KES {p.price}</span>
            </button>
          ))}
        </div>
      </section>

      {total && total.balance > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-black/10 bg-white p-3 md:bottom-0 dark:border-white/10 dark:bg-zinc-900">
          <button
            onClick={recordCashPayment}
            disabled={busy}
            className="w-full rounded-lg bg-gold-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-700 disabled:opacity-50 dark:bg-gold-500 dark:text-black dark:hover:bg-gold-400"
          >
            Record cash payment — KES {total.balance.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
}

export default function TabDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading...</div>}>
      <TabDetailContent />
    </Suspense>
  );
}
