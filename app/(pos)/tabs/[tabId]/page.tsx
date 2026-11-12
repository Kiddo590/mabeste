"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { useToast } from "../../_components/Toast";
import { useConfirm } from "../../_components/ConfirmDialog";
import { Badge, type BadgeVariant } from "../../_components/Badge";
import { Button } from "../../_components/Button";
import { Input } from "../../_components/Field";
import { SkeletonRows } from "../../_components/Skeleton";
import { formatKES } from "@/lib/format";
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
  products: { name: string; image_url: string | null; size: string | null } | null;
  orders: { created_by: string } | null;
};

type GroupedLine = {
  product_id: string;
  name: string;
  size: string | null;
  quantity: number;
  unit_price: number;
  canVoid: boolean;
};

const CLOSED_STATUSES = new Set(["closed", "voided", "merged"]);

function statusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "open":
      return { label: "Open", variant: "brand" };
    case "pending_payment":
      return { label: "Awaiting payment", variant: "warning" };
    case "closed":
      return { label: "Closed", variant: "success" };
    case "voided":
      return { label: "Voided", variant: "danger" };
    default:
      return { label: status, variant: "neutral" };
  }
}

function TabDetailContent() {
  const { tabId } = useParams<{ tabId: string }>();
  const router = useRouter();
  const session = useStaffSession();
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<TabRow | null>(null);
  const [total, setTotal] = useState<TabTotal | null>(null);
  const [items, setItems] = useState<OrderItemWithJoins[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [amountDraft, setAmountDraft] = useState("");
  const [cashTendered, setCashTendered] = useState("");

  async function loadAll() {
    const supabase = getSupabaseClient();
    try {
      const [tabResult, totalResult, itemsResult, productsList, categoriesList] = await Promise.all([
        supabase.from("tabs").select("*, tables(label)").eq("id", tabId).single(),
        supabase.from("tab_totals").select("*").eq("tab_id", tabId).maybeSingle(),
        supabase
          .from("order_items")
          .select("*, products(name, image_url, size), orders!inner(tab_id, created_by)")
          .eq("orders.tab_id", tabId)
          .eq("line_status", "active")
          .order("created_at"),
        fetchAllRows<ProductRow>((from, to) =>
          supabase.from("products").select("*").eq("is_active", true).order("name").range(from, to)
        ),
        fetchAllRows<CategoryRow>((from, to) => supabase.from("categories").select("*").order("sort_order").range(from, to)),
      ]);
      if (tabResult.error) throw new Error(tabResult.error.message);
      if (totalResult.error) throw new Error(totalResult.error.message);
      if (itemsResult.error) throw new Error(itemsResult.error.message);
      setTab(tabResult.data as unknown as TabRow);
      setTotal(totalResult.data);
      setItems((itemsResult.data ?? []) as unknown as OrderItemWithJoins[]);
      setProducts(productsList);
      setCategories(categoriesList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tab");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  useEffect(() => {
    setAmountDraft(total && total.balance > 0 ? String(total.balance) : "");
  }, [total?.balance]);

  // Every add is a fresh order_items row, even for a product already on the
  // tab — never an update to an existing line. That keeps void/edit
  // permissions scoped per-order (via order_items_update's RLS, which checks
  // orders.created_by) without needing a staff column on order_items itself.
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

  async function addItem(product: ProductRow) {
    if (!session) return;
    setBusy(true);
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
      toast.error(err instanceof Error ? err.message : "Couldn't add item");
    } finally {
      setBusy(false);
    }
  }

  async function voidOneUnit(productId: string) {
    const item = items.find((i) => i.product_id === productId && i.line_status === "active");
    if (!item || !session) return;
    setBusy(true);
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
      toast.error(err instanceof Error ? err.message : "Couldn't remove item");
    } finally {
      setBusy(false);
    }
  }

  // payments' auto-close trigger is AFTER UPDATE, not INSERT — a payment
  // must land as 'pending' first, then transition to 'completed', or the
  // tab never auto-closes.
  async function recordCashPayment() {
    if (!total || !session) return;
    const amount = Number(amountDraft);
    if (!amountDraft || Number.isNaN(amount) || amount <= 0 || amount > total.balance + 0.01) {
      toast.error(`Enter an amount up to ${formatKES(total.balance)}`);
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const paymentId = crypto.randomUUID();
      const { error: insertError } = await supabase.from("payments").insert({
        id: paymentId,
        tab_id: tabId,
        method: "cash",
        amount,
        status: "pending",
        recorded_by: session.staff_id,
      });
      if (insertError) throw new Error(insertError.message);

      const { error: updateError } = await supabase
        .from("payments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", paymentId);
      if (updateError) throw new Error(updateError.message);

      setCashTendered("");
      toast.success(`Cash payment of ${formatKES(amount)} recorded`);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record payment");
    } finally {
      setBusy(false);
    }
  }

  async function voidTab() {
    if (!tab || !session || session.staff_role !== "admin") return;
    const ok = await confirm({
      title: "Void this tab?",
      message: "This cancels the whole tab and its order lines. This can't be undone.",
      confirmLabel: "Void tab",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { error } = await getSupabaseClient().rpc("update_tab_status", {
        p_tab_id: tab.id,
        p_expected_version: tab.version,
        p_new_status: "voided",
        p_closed_by: session.staff_id,
      });
      if (error) throw new Error(error.message);
      toast.success("Tab voided");
      router.push("/tabs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't void tab");
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
          size: item.products?.size ?? null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          canVoid: mine,
        });
      }
    }
    return Array.from(map.values());
  }, [items, session]);

  const sellableProducts = products.filter((p) => p.price > 0);
  const hiddenUnpriced = products.length - sellableProducts.length;
  const visibleProducts = sellableProducts.filter((p) => {
    if (categoryFilter && p.category_id !== categoryFilter) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <SkeletonRows rows={5} />
      </div>
    );
  }

  if (!tab) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-medium">Tab not found</p>
        <Link href="/tabs" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
          &larr; Back to tabs
        </Link>
      </div>
    );
  }

  const isClosed = CLOSED_STATUSES.has(tab.status);
  const badge = statusBadge(tab.status);
  const change = (() => {
    const tendered = Number(cashTendered);
    const amount = Number(amountDraft);
    if (!cashTendered || Number.isNaN(tendered) || Number.isNaN(amount) || tendered < amount) return null;
    return tendered - amount;
  })();

  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? "bg-brand-600 text-white" : "bg-surface-sunken text-ink-muted hover:text-foreground"
    }`;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pb-40 md:pb-24 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/tabs" className="text-sm text-ink-muted hover:text-brand-600 dark:hover:text-brand-400">
            &larr; Tabs
          </Link>
          <div className="mt-0.5 flex items-center gap-2">
            <h1 className="text-lg font-semibold">{tab.tables?.label ?? tab.label ?? "Tab"}</h1>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </div>
        {session?.staff_role === "admin" && !isClosed && (
          <Button variant="ghost" size="sm" loading={busy} onClick={voidTab} className="text-red-600 hover:text-red-700">
            Void tab
          </Button>
        )}
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">Order</h2>
        {groupedItems.length === 0 ? (
          <p className="text-sm text-ink-muted">No items yet{isClosed ? "." : " — add from the menu below."}</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {groupedItems.map((g) => (
              <div key={g.product_id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{g.name}</span>
                  {g.size && <span className="text-xs text-ink-muted">{g.size}</span>}
                </div>
                {!isClosed && g.canVoid && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => voidOneUnit(g.product_id)}
                      disabled={busy}
                      aria-label={`Remove one ${g.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-50"
                    >
                      −
                    </button>
                    <span className="tabular w-5 text-center text-sm">{g.quantity}</span>
                    <button
                      onClick={() => {
                        const product = products.find((p) => p.id === g.product_id);
                        if (product) addItem(product);
                      }}
                      disabled={busy}
                      aria-label={`Add one more ${g.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>
                )}
                <span className="tabular w-20 shrink-0 text-right text-sm text-ink-muted">
                  {formatKES(g.quantity * g.unit_price)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="text-ink-muted">Paid</span>
          <span className="tabular">{formatKES(total?.paid_total ?? 0)}</span>
        </div>
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Balance</span>
          <span className="tabular text-brand-700 dark:text-brand-300">{formatKES(total?.balance ?? 0)}</span>
        </div>
      </section>

      {isClosed ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
          <p className="text-sm text-ink-muted">
            {tab.status === "voided" ? "This tab was voided." : "This tab is settled."}
          </p>
          <div className="flex gap-2">
            <Link href={`/tabs/${tab.id}/receipt`}>
              <Button variant="secondary">View receipt</Button>
            </Link>
            <Link href="/tabs">
              <Button>Back to tabs</Button>
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap gap-2">
              <button onClick={() => setCategoryFilter(null)} className={pill(!categoryFilter)}>
                All
              </button>
              {categories.map((c) => (
                <button key={c.id} onClick={() => setCategoryFilter(c.id)} className={pill(categoryFilter === c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-line px-3 py-2 transition-colors focus-within:border-brand-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0 text-ink-muted">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3-3" strokeLinecap="round" />
              </svg>
              <input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            {hiddenUnpriced > 0 && (
              <p className="mb-3 text-xs text-ink-muted">
                {hiddenUnpriced} unpriced {hiddenUnpriced === 1 ? "item is" : "items are"} hidden — set prices in{" "}
                <Link href="/admin/products" className="text-brand-600 hover:underline dark:text-brand-400">
                  Products
                </Link>
                .
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addItem(p)}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised p-2 text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-50"
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-brand-50 dark:bg-brand-950/30">
                    {p.image_url && <Image src={p.image_url} alt="" fill sizes="40px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-ink-muted">
                      {formatKES(p.price)}
                      {p.size && ` · ${p.size}`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {total && total.balance > 0 && (
            <div className="no-print fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface p-3 md:bottom-0">
              <div className="mx-auto flex max-w-xl flex-wrap items-end gap-2">
                <div className="min-w-[140px] flex-1">
                  <label className="mb-1 block text-xs text-ink-muted">Amount (balance {formatKES(total.balance)})</label>
                  <div className="flex items-center overflow-hidden rounded-lg border border-line transition-colors focus-within:border-brand-500">
                    <span className="bg-surface-sunken px-2 text-xs text-ink-muted">KES</span>
                    <input
                      type="number"
                      min={0}
                      max={total.balance}
                      step="0.01"
                      value={amountDraft}
                      onChange={(e) => setAmountDraft(e.target.value)}
                      className="w-full bg-transparent px-2 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-xs text-ink-muted">Cash tendered</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="w-full"
                  />
                </div>
                <Button loading={busy} onClick={recordCashPayment} className="h-[38px]">
                  Cash payment
                </Button>
              </div>
              {change !== null && (
                <p className="mx-auto mt-1 max-w-xl text-right text-sm text-ink-muted">
                  Change due: <span className="tabular font-medium text-foreground">{formatKES(change)}</span>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TabDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 md:p-6">
          <SkeletonRows rows={5} />
        </div>
      }
    >
      <TabDetailContent />
    </Suspense>
  );
}
