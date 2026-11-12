"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase/client";
import { uploadProductImage } from "@/lib/supabase/storage";
import { fetchAllRows } from "@/lib/supabase/pagination";
import type { Database } from "@/lib/supabase/types";
import starterCatalogue from "@/lib/data/starter-catalogue.json";
import { ImageUploadField } from "../../_components/ImageUploadField";
import { RequireAdmin } from "../../_components/RequireAdmin";
import { useToast } from "../../_components/Toast";
import { useConfirm } from "../../_components/ConfirmDialog";
import { Badge } from "../../_components/Badge";
import { Button } from "../../_components/Button";
import { Input, Select } from "../../_components/Field";
import { PageHeader } from "../../_components/PageHeader";
import { SkeletonGrid } from "../../_components/Skeleton";
import { EmptyState } from "../../_components/EmptyState";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

const STARTER_CATEGORY_NAMES = ["Beer", "Spirits", "Wine"] as const;
const PAGE_SIZE = 60;

function ProductThumb({
  product,
  onReplace,
  onError,
}: {
  product: ProductRow;
  onReplace: (url: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      onReplace(url);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      title="Change photo"
      className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50 dark:bg-brand-950/30"
    >
      {product.image_url ? (
        <Image src={product.image_url} alt={product.name} fill sizes="80px" className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-8 w-8 text-brand-400 dark:text-brand-600"
          >
            <path
              d="M9 2h6v4.5l2 3V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9.5l2-3V2Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M7 9.5h10" strokeLinecap="round" />
          </svg>
        </span>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
        {uploading ? (
          <span className="text-[10px]">Uploading...</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </button>
  );
}

function AdminProductsContent() {
  const toast = useToast();
  const confirm = useConfirm();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newSize, setNewSize] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function loadAll() {
    const supabase = getSupabaseClient();
    try {
      const [cats, prods] = await Promise.all([
        fetchAllRows<CategoryRow>((from, to) =>
          supabase.from("categories").select("*").order("sort_order").range(from, to)
        ),
        fetchAllRows<ProductRow>((from, to) => supabase.from("products").select("*").order("name").range(from, to)),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importStarterCatalogue() {
    setImporting(true);
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

      const existingProducts = await fetchAllRows<{
        id: string;
        name: string;
        image_url: string | null;
        size: string | null;
      }>((from, to) => supabase.from("products").select("id, name, image_url, size").range(from, to));
      // Matched by image_url (stable, one per catalogue entry) rather than
      // name — an earlier version of this catalogue had broken names for
      // items where the source API splits brand from a bare variant
      // descriptor (e.g. name "10", brand "Atlas"), so re-running this also
      // repairs any previously-imported product whose name or size is now
      // corrected/added (e.g. the size column didn't exist at all until a
      // later migration — every pre-existing row needs a one-time backfill).
      const existingByImage = new Map(existingProducts.filter((p) => p.image_url).map((p) => [p.image_url, p]));

      const toInsert: { name: string; price: number; image_url: string; size: string | null; category_id: string | null }[] = [];
      const toFix: { id: string; name?: string; size?: string | null }[] = [];
      for (const item of starterCatalogue) {
        const existing = existingByImage.get(item.image_url);
        if (existing) {
          const patch: { name?: string; size?: string | null } = {};
          if (existing.name !== item.name) patch.name = item.name;
          if (existing.size !== (item.size ?? null)) patch.size = item.size ?? null;
          if (Object.keys(patch).length > 0) toFix.push({ id: existing.id, ...patch });
        } else {
          toInsert.push({
            name: item.name,
            price: 0,
            image_url: item.image_url,
            size: item.size ?? null,
            category_id: categoryIdByName.get(item.category) ?? null,
          });
        }
      }

      // The full catalogue can mean thousands of new rows — insert in
      // batches rather than one request, to stay well under any payload or
      // statement-timeout limit.
      const INSERT_BATCH_SIZE = 500;
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
        const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE);
        const { error: insertError } = await supabase.from("products").insert(batch);
        if (insertError) throw new Error(insertError.message);
      }
      // A size backfill touches essentially every already-imported row the
      // first time this runs post-migration — fan out in small concurrent
      // batches rather than one request at a time, which would otherwise be
      // a multi-thousand-request serial chain on a single click.
      const FIX_CONCURRENCY = 20;
      for (let i = 0; i < toFix.length; i += FIX_CONCURRENCY) {
        const chunk = toFix.slice(i, i + FIX_CONCURRENCY);
        await Promise.all(
          chunk.map(({ id, ...patch }) =>
            supabase
              .from("products")
              .update(patch)
              .eq("id", id)
              .then(({ error }) => {
                if (error) throw new Error(error.message);
              })
          )
        );
      }

      await loadAll();
      if (toInsert.length === 0 && toFix.length === 0) toast.info("Catalogue is already up to date");
      else toast.success(`Catalogue loaded — ${toInsert.length} added, ${toFix.length} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function savePrice(product: ProductRow) {
    const draft = priceDrafts[product.id];
    const price = Number(draft);
    if (draft === undefined || draft === "" || Number.isNaN(price) || price < 0) return;
    setSavingId(product.id);
    try {
      const { error } = await getSupabaseClient().from("products").update({ price }).eq("id", product.id);
      if (error) throw new Error(error.message);
      setPriceDrafts((d) => {
        const next = { ...d };
        delete next[product.id];
        return next;
      });
      toast.success(`${product.name} priced at KES ${price}`);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save price");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(row: ProductRow) {
    if (row.is_active) {
      const ok = await confirm({
        title: `Hide ${row.name} from the menu?`,
        message: "Deactivated products can't be added to tabs. You can reactivate it any time.",
        confirmLabel: "Deactivate",
        danger: true,
      });
      if (!ok) return;
    }
    const { error } = await getSupabaseClient()
      .from("products")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) {
      toast.error(`Couldn't update ${row.name}: ${error.message}`);
      return;
    }
    toast.success(row.is_active ? `${row.name} deactivated` : `${row.name} reactivated`);
    await loadAll();
  }

  async function replaceProductImage(product: ProductRow, url: string) {
    const { error } = await getSupabaseClient().from("products").update({ image_url: url }).eq("id", product.id);
    if (error) {
      toast.error(`Couldn't save photo: ${error.message}`);
      return;
    }
    toast.success(`Photo updated for ${product.name}`);
    await loadAll();
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!newName.trim() || !newCategoryId) {
      setAddError("Name and category are required");
      return;
    }
    const price = newPrice ? Number(newPrice) : 0;
    if (Number.isNaN(price) || price < 0) {
      setAddError("Price must be a positive number");
      return;
    }
    setAdding(true);
    try {
      const { error } = await getSupabaseClient().from("products").insert({
        name: newName.trim(),
        price,
        category_id: newCategoryId,
        image_url: newImageUrl.trim() || null,
        size: newSize.trim() || null,
      });
      if (error) throw new Error(error.message);
      toast.success(`${newName.trim()} added`);
      setNewName("");
      setNewPrice("");
      setNewCategoryId("");
      setNewImageUrl("");
      setNewSize("");
      await loadAll();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add product");
    } finally {
      setAdding(false);
    }
  }

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";
  const filteredProducts = products.filter((p) => {
    if (categoryFilter && p.category_id !== categoryFilter) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });
  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const unpricedCount = products.filter((p) => p.is_active && p.price <= 0).length;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, categoryFilter]);

  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? "bg-brand-600 text-white" : "bg-surface-sunken text-ink-muted hover:text-foreground"
    }`;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Products"
        subtitle={
          loading
            ? undefined
            : products.length === 0
              ? "No products yet — load the starter catalogue to get going, then set your own prices."
              : unpricedCount > 0
                ? `${unpricedCount} products still have no price and are hidden from the order screen.`
                : "Everything is priced and ready to sell."
        }
        actions={
          <Button variant={products.length === 0 ? "primary" : "secondary"} loading={importing} onClick={importStarterCatalogue}>
            {importing ? "Loading catalogue..." : "Load starter catalogue"}
          </Button>
        }
      />

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-base font-semibold">Add a product</h2>
        <form onSubmit={addProduct} className="flex flex-wrap items-start gap-3">
          <Input
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)}>
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input placeholder="Size (e.g. 750ml)" value={newSize} onChange={(e) => setNewSize(e.target.value)} className="w-36" />
          <div className="flex items-center overflow-hidden rounded-lg border border-line transition-colors focus-within:border-brand-500">
            <span className="bg-surface-sunken px-2 text-xs text-ink-muted">KES</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="w-24 appearance-none bg-transparent px-2 py-2 text-sm outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <ImageUploadField value={newImageUrl || null} onChange={(url) => setNewImageUrl(url ?? "")} />
          <Button type="submit" loading={adding}>
            Add product
          </Button>
        </form>
        {addError && <p className="mt-3 text-sm text-red-600">{addError}</p>}
      </section>

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
          <SkeletonGrid count={6} />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            title={products.length === 0 ? "No products yet" : "No products match this filter"}
            hint={products.length === 0 ? "Load the starter catalogue or add a product above." : undefined}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProducts.map((p) => (
                <div
                  key={p.id}
                  className={`flex gap-3 rounded-2xl border border-line bg-surface-raised p-3 shadow-sm transition-shadow hover:shadow-md ${
                    p.is_active ? "" : "opacity-50"
                  }`}
                >
                  <ProductThumb
                    product={p}
                    onReplace={(url) => replaceProductImage(p, url)}
                    onError={(message) => toast.error(`Photo upload failed: ${message}`)}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="brand">{categoryName(p.category_id)}</Badge>
                      {p.size && <span className="text-xs text-ink-muted">{p.size}</span>}
                      {p.price <= 0 && <Badge variant="warning">No price</Badge>}
                    </span>
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      <div className="flex items-center overflow-hidden rounded-lg border border-line transition-colors focus-within:border-brand-500">
                        <span className="bg-surface-sunken px-1.5 text-xs text-ink-muted">KES</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={priceDrafts[p.id] ?? String(p.price)}
                          onChange={(e) => setPriceDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                          className="w-24 appearance-none bg-transparent px-2 py-1 text-sm outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      <Button size="sm" loading={savingId === p.id} onClick={() => savePrice(p)}>
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`ml-auto ${p.is_active ? "text-red-600 hover:text-red-700" : ""}`}
                        onClick={() => toggleActive(p)}
                      >
                        {p.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
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

export default function AdminProductsPage() {
  return (
    <RequireAdmin>
      <AdminProductsContent />
    </RequireAdmin>
  );
}
