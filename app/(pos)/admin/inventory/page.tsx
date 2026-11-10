"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { RequireAdmin } from "../../_components/RequireAdmin";
import type { Database } from "@/lib/supabase/types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"] & { categories: { name: string } | null };

const REASONS = ["restock", "adjustment"] as const;
type Reason = (typeof REASONS)[number];

function InventoryContent() {
  const session = useStaffSession();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, Reason>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadAll() {
    const { data, error } = await getSupabaseClient().from("products").select("*, categories(name)").order("name");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setProducts((data ?? []) as unknown as ProductRow[]);
  }

  useEffect(() => {
    loadAll();
  }, []);

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h1 className="mb-1 text-lg font-semibold">Inventory</h1>
        <p className="mb-4 text-sm text-zinc-500">
          Adjust stock manually. Positive numbers add stock, negative numbers remove it.
        </p>
        {loadError && <p className="text-red-600">{loadError}</p>}
        {actionError && <p className="text-red-600">{actionError}</p>}
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
              {products.map((p) => {
                const low = p.track_stock && p.stock_qty <= p.low_stock_threshold;
                return (
                  <tr key={p.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">{p.name}</td>
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
                        className="rounded bg-gold-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gold-700 disabled:opacity-50 dark:bg-gold-500 dark:text-black dark:hover:bg-gold-400"
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
