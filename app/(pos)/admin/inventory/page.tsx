"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { RequireAdmin } from "../../_components/RequireAdmin";
import type { Database } from "@/lib/supabase/types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"] & { categories: { name: string } | null };
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

const REASONS = ["restock", "adjustment"] as const;
type Reason = (typeof REASONS)[number];
const PAGE_SIZE = 60;

function InventoryContent() {
  const session = useStaffSession();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, Reason>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  async function loadAll() {
    try {
      const supabase = getSupabaseClient();
      const [prods, cats] = await Promise.all([
        fetchAllRows<ProductRow>(
          (from, to) =>
            supabase.from("products").select("*, categories(name)").order("name").range(from, to) as unknown as PromiseLike<{
              data: ProductRow[] | null;
              error: { message: string } | null;
            }>
        ),
        fetchAllRows<CategoryRow>((from, to) => supabase.from("categories").select("*").order("sort_order").range(from, to)),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load products");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, categoryFilter, lowStockOnly]);

  // Never write products.stock_qty directly — apply_stock_movement (a
  // trigger on stock_movements insert) handles it.
  async function adjust(product: ProductRow) {
    const qtyStr = qtyDrafts[product.id];
    const changeQty = Number(qtyStr);
    if (!qtyStr || Number.isNaN(changeQty) || changeQty === 0 || !session) return;
    setSavingId(product.id);
    setActionError(null);
    try {
      const { error } = await getSupabaseClient()
        .from("stock_movements")
        .insert({
          id: crypto.randomUUID(),
          product_id: product.id,
          change_qty: changeQty,
          reason: reasonDrafts[product.id] ?? "restock",
          staff_id: session.staff_id,
        });
      if (error) throw new Error(error.message);
      setQtyDrafts((d) => ({ ...d, [product.id]: "" }));
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSavingId(null);
    }
  }

  const filteredProducts = products.filter((p) => {
    if (categoryFilter && p.category_id !== categoryFilter) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (lowStockOnly && !(p.track_stock && p.stock_qty <= p.low_stock_threshold)) return false;
    return true;
  });
  const visibleProducts = filteredProducts.slice(0, visibleCount);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h1 className="mb-1 text-lg font-semibold">Inventory</h1>
        <p className="mb-4 text-sm text-zinc-500">
          Adjust stock manually. Positive numbers add stock, negative numbers remove it.
        </p>
        {loadError && <p className="mb-3 text-red-600">{loadError}</p>}
        {actionError && <p className="mb-3 text-red-600">{actionError}</p>}

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
          <button
            onClick={() => setLowStockOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              lowStockOnly ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800"
            }`}
          >
            Low stock only
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded border border-black/10 px-3 py-2 focus-within:border-brand-500/50 dark:border-white/10 dark:focus-within:border-brand-400/40">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0 text-zinc-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search products by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm outline-none"
          />
          <span className="shrink-0 text-xs text-zinc-400">
            {filteredProducts.length} of {products.length}
          </span>
        </div>

        {filteredProducts.length === 0 && <p className="text-sm text-zinc-500">No products match this filter.</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Stock</th>
                <th className="py-2 pr-4">Adjust by</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => {
                const low = p.track_stock && p.stock_qty <= p.low_stock_threshold;
                return (
                  <tr key={p.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">
                      {p.name}
                      {p.size && <span className="ml-1 text-xs text-zinc-400">({p.size})</span>}
                    </td>
                    <td className="py-2 pr-4 text-zinc-500">{p.categories?.name ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {p.track_stock ? (
                        <span className={low ? "font-semibold text-red-600" : ""}>
                          {p.stock_qty}
                          {low ? " (low)" : ""}
                        </span>
                      ) : (
                        <span className="text-zinc-400">not tracked</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        step="1"
                        placeholder="±qty"
                        value={qtyDrafts[p.id] ?? ""}
                        onChange={(e) => setQtyDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                        className="w-20 rounded border border-black/10 px-2 py-1 focus:border-brand-500/50 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:focus:border-brand-400/40"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        value={reasonDrafts[p.id] ?? "restock"}
                        onChange={(e) => setReasonDrafts((d) => ({ ...d, [p.id]: e.target.value as Reason }))}
                        className="rounded border border-black/10 px-2 py-1 focus:border-brand-500/50 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:focus:border-brand-400/40"
                      >
                        <option value="restock">Restock</option>
                        <option value="adjustment">Adjustment</option>
                      </select>
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => adjust(p)}
                        disabled={savingId === p.id}
                        className="rounded bg-accent-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50 dark:bg-accent-500 dark:text-black dark:hover:bg-accent-400"
                      >
                        Apply
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleCount < filteredProducts.length && (
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="mt-4 w-full rounded border border-black/10 py-2 text-sm text-zinc-600 hover:border-brand-500/50 hover:text-brand-600 dark:border-white/10 dark:text-zinc-400 dark:hover:border-brand-400/40 dark:hover:text-brand-400"
          >
            Load more ({filteredProducts.length - visibleCount} remaining)
          </button>
        )}
      </section>
    </div>
  );
}

export default function AdminInventoryPage() {
  return (
    <RequireAdmin>
      <InventoryContent />
    </RequireAdmin>
  );
}
