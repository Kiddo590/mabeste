"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { RequireAdmin } from "../../_components/RequireAdmin";
import { useToast } from "../../_components/Toast";
import { Button } from "../../_components/Button";
import { Input } from "../../_components/Field";
import { PageHeader } from "../../_components/PageHeader";
import { SkeletonRows } from "../../_components/Skeleton";
import { EmptyState } from "../../_components/EmptyState";
import type { Database } from "@/lib/supabase/types";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

function AdminCategoriesContent() {
  const toast = useToast();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data, error } = await getSupabaseClient().from("categories").select("*").order("sort_order");
    if (error) toast.error(`Couldn't load categories: ${error.message}`);
    else setCategories(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const nextSort = categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 0;
      const { error } = await getSupabaseClient().from("categories").insert({ name: newName.trim(), sort_order: nextSort });
      if (error) throw new Error(error.message);
      toast.success(`${newName.trim()} added`);
      setNewName("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add category");
    } finally {
      setAdding(false);
    }
  }

  async function saveName(row: CategoryRow) {
    if (!editDraft.trim()) return;
    setBusyId(row.id);
    try {
      const { error } = await getSupabaseClient().from("categories").update({ name: editDraft.trim() }).eq("id", row.id);
      if (error) throw new Error(error.message);
      toast.success("Category renamed");
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't rename category");
    } finally {
      setBusyId(null);
    }
  }

  async function move(row: CategoryRow, direction: -1 | 1) {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((c) => c.id === row.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    setBusyId(row.id);
    try {
      const supabase = getSupabaseClient();
      const [a, b] = await Promise.all([
        supabase.from("categories").update({ sort_order: swapWith.sort_order }).eq("id", row.id),
        supabase.from("categories").update({ sort_order: row.sort_order }).eq("id", swapWith.id),
      ]);
      if (a.error) throw new Error(a.error.message);
      if (b.error) throw new Error(b.error.message);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reorder");
    } finally {
      setBusyId(null);
    }
  }

  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Categories" subtitle="Groups products on the order screen and in Reports." />

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : sorted.length === 0 ? (
          <EmptyState title="No categories yet" hint="Add the first one below." />
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {sorted.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                {editingId === c.id ? (
                  <>
                    <Input
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      className="max-w-[12rem]"
                      autoFocus
                    />
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" loading={busyId === c.id} onClick={() => saveName(c)}>
                        Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">{c.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => move(c, -1)}
                        disabled={i === 0 || busyId === c.id}
                        aria-label={`Move ${c.name} up`}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-30"
                      >
                        &uarr;
                      </button>
                      <button
                        onClick={() => move(c, 1)}
                        disabled={i === sorted.length - 1 || busyId === c.id}
                        aria-label={`Move ${c.name} down`}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-30"
                      >
                        &darr;
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditDraft(c.name);
                        }}
                      >
                        Rename
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-ink-muted">
          Categories can be renamed and reordered but not deleted — rename an unused one instead. Manage products from{" "}
          <Link href="/admin/products" className="text-brand-600 hover:underline dark:text-brand-400">
            Products
          </Link>
          .
        </p>
      </section>

      <section className="max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-base font-semibold">Add a category</h2>
        <form onSubmit={addCategory} className="flex gap-2">
          <Input placeholder="e.g. Snacks, Soft drinks" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button type="submit" loading={adding}>
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}

export default function AdminCategoriesPage() {
  return (
    <RequireAdmin>
      <AdminCategoriesContent />
    </RequireAdmin>
  );
}
