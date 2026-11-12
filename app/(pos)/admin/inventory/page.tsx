"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { RequireAdmin } from "../../_components/RequireAdmin";
import { useToast } from "../../_components/Toast";
import { Badge } from "../../_components/Badge";
import { Button } from "../../_components/Button";
import { Input, Select } from "../../_components/Field";
import { PageHeader } from "../../_components/PageHeader";
import { SkeletonRows } from "../../_components/Skeleton";
import { EmptyState } from "../../_components/EmptyState";
import type { Database } from "@/lib/supabase/types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"] & { categories: { name: string } | null };
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

const REASONS = ["restock", "adjustment"] as const;
type Reason = (typeof REASONS)[number];
const PAGE_SIZE = 60;

function InventoryContent() {
  const session = useStaffSession();
  const toast = useToast();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, Reason>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(searchParams.get("low") === "1");
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
      toast.error(err instanceof Error ? err.message : "Couldn't load inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast.success(`${product.name}: ${changeQty > 0 ? "+" : ""}${changeQty} → ${product.stock_qty + changeQty} in stock`);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to adjust stock");
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
  const lowCount = products.filter((p) => p.track_stock && p.stock_qty <= p.low_stock_threshold).length;

  const pill = (active: boolean, danger = false) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? (danger ? "bg-amber-500 text-white" : "bg-brand-600 text-white") : "bg-surface-sunken text-ink-muted hover:text-foreground"
    }`;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Inventory"
        subtitle="Adjust stock manually — positive numbers add stock, negative numbers remove it."
        actions={
          lowCount > 0 ? (
            <Badge variant="warning">
              {lowCount} low on stock
            </Badge>
          ) : undefined
        }
      />

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => setCategoryFilter(null)} className={pill(!categoryFilter)}>
            All
          </button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategoryFilter(c.id)} className={pill(categoryFilter === c.id)}>
              {c.name}
            </button>
          ))}
          <button onClick={() => setLowStockOnly((v) => !v)} className={pill(lowStockOnly, true)}>
            Low stock only
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-lg border border-line px-3 py-2 transition-colors focus-within:border-brand-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0 text-ink-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search products by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm outline-none"
          />
          {!loading && (
            <span className="shrink-0 text-xs text-ink-muted">
              {filteredProducts.length} of {products.length}
            </span>
          )}
        </div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            title={products.length === 0 ? "No products yet" : "No products match this filter"}
            hint={products.length === 0 ? "Add products or load the starter catalogue on the Products page." : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-line text-ink-muted">
                    <th className="py-2 pr-4 font-medium">Product</th>
                    <th className="py-2 pr-4 font-medium">Category</th>
                    <th className="py-2 pr-4 font-medium">Stock</th>
                    <th className="py-2 pr-4 font-medium">Adjust by</th>
                    <th className="py-2 pr-4 font-medium">Reason</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((p) => {
                    const low = p.track_stock && p.stock_qty <= p.low_stock_threshold;
                    return (
                      <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4">
                          <span className="font-medium">{p.name}</span>
                          {p.size && <span className="ml-1 text-xs text-ink-muted">({p.size})</span>}
                        </td>
                        <td className="py-2 pr-4 text-ink-muted">{p.categories?.name ?? "—"}</td>
                        <td className="py-2 pr-4">
                          {p.track_stock ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="tabular font-medium">{p.stock_qty}</span>
                              {low && <Badge variant="warning">Low</Badge>}
                            </span>
                          ) : (
                            <span className="text-ink-muted">not tracked</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            type="number"
                            step="1"
                            placeholder="±qty"
                            value={qtyDrafts[p.id] ?? ""}
                            onChange={(e) => setQtyDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                            className="w-24 py-1"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Select
                            value={reasonDrafts[p.id] ?? "restock"}
                            onChange={(e) => setReasonDrafts((d) => ({ ...d, [p.id]: e.target.value as Reason }))}
                            className="py-1"
                          >
                            <option value="restock">Restock</option>
                            <option value="adjustment">Adjustment</option>
                          </Select>
                        </td>
                        <td className="py-2">
                          <Button size="sm" loading={savingId === p.id} onClick={() => adjust(p)}>
                            Apply
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visibleCount < filteredProducts.length && (
              <Button variant="secondary" className="mt-4 w-full" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Load more ({filteredProducts.length - visibleCount} remaining)
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default function AdminInventoryPage() {
  return (
    <RequireAdmin>
      <Suspense fallback={null}>
        <InventoryContent />
      </Suspense>
    </RequireAdmin>
  );
}
