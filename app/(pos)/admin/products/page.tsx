"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import starterCatalogue from "@/lib/data/starter-catalogue.json";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

const STARTER_CATEGORY_NAMES = ["Beer", "Spirits", "Wine"] as const;

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function loadAll() {
    const supabase = getSupabaseClient();
    const [{ data: cats, error: catError }, { data: prods, error: prodError }] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("products").select("*").order("name"),
    ]);
    if (catError || prodError) {
      setLoadError(catError?.message ?? prodError?.message ?? "Failed to load products");
      return;
    }
    setCategories(cats ?? []);
    setProducts(prods ?? []);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function importStarterCatalogue() {
    setImporting(true);
    setImportError(null);
    try {
      const supabase = getSupabaseClient();

      const { data: existingCats, error: catLoadError } = await supabase.from("categories").select("*");
      if (catLoadError) throw new Error(catLoadError.message);

      const categoryIdByName = new Map((existingCats ?? []).map((c) => [c.name, c.id]));
      const missingCategoryNames = STARTER_CATEGORY_NAMES.filter((n) => !categoryIdByName.has(n));
      if (missingCategoryNames.length > 0) {
        const { data: inserted, error: catInsertError } = await supabase
          .from("categories")
          .insert(missingCategoryNames.map((name, i) => ({ name, sort_order: 100 + i })))
          .select("*");
        if (catInsertError) throw new Error(catInsertError.message);
        for (const c of inserted ?? []) categoryIdByName.set(c.name, c.id);
      }

      const { data: existingProducts, error: prodLoadError } = await supabase
        .from("products")
        .select("name");
      if (prodLoadError) throw new Error(prodLoadError.message);
      const existingNames = new Set((existingProducts ?? []).map((p) => p.name));

      const toInsert = starterCatalogue
        .filter((item) => !existingNames.has(item.name))
        .map((item) => ({
          name: item.name,
          price: 0,
          image_url: item.image_url,
          category_id: categoryIdByName.get(item.category) ?? null,
        }));

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from("products").insert(toInsert);
        if (insertError) throw new Error(insertError.message);
      }

      await loadAll();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function savePrice(id: string) {
    const draft = priceDrafts[id];
    const price = Number(draft);
    if (!draft || Number.isNaN(price) || price < 0) return;
    setSavingId(id);
    try {
      const { error } = await getSupabaseClient().from("products").update({ price }).eq("id", id);
      if (!error) await loadAll();
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(row: ProductRow) {
    const { error } = await getSupabaseClient()
      .from("products")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (!error) loadAll();
  }

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Products</h1>
            <p className="text-sm text-zinc-500">
              {products.length === 0
                ? "No products yet — load the starter catalogue to get going, then set your own prices below."
                : "Set a price for each product. New items default to 0 until priced."}
            </p>
          </div>
          <button
            onClick={importStarterCatalogue}
            disabled={importing}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:text-black dark:hover:bg-amber-400"
          >
            {importing ? "Loading catalogue..." : "Load starter catalogue"}
          </button>
        </div>
        {importError && <p className="mt-3 text-red-600">{importError}</p>}
        {loadError && <p className="mt-3 text-red-600">{loadError}</p>}
      </section>

      {products.length > 0 && (
        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <div
                key={p.id}
                className={`flex gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10 ${
                  p.is_active ? "" : "opacity-50"
                }`}
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  {p.image_url && (
                    <Image src={p.image_url} alt={p.name} fill sizes="64px" className="object-cover" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-zinc-500">{categoryName(p.category_id)}</span>
                  <div className="mt-auto flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={priceDrafts[p.id] ?? String(p.price)}
                      onChange={(e) => setPriceDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      className="w-20 rounded border border-black/10 px-2 py-1 text-sm focus:border-amber-500/50 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:focus:border-amber-400/40"
                    />
                    <button
                      onClick={() => savePrice(p.id)}
                      disabled={savingId === p.id}
                      className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:text-black dark:hover:bg-amber-400"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className="ml-auto text-xs text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400"
                    >
                      {p.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
