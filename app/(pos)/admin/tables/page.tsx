"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { RequireAdmin } from "../../_components/RequireAdmin";
import { useToast } from "../../_components/Toast";
import { Badge } from "../../_components/Badge";
import { Button } from "../../_components/Button";
import { Input } from "../../_components/Field";
import { PageHeader } from "../../_components/PageHeader";
import { SkeletonRows } from "../../_components/Skeleton";
import { EmptyState } from "../../_components/EmptyState";
import type { Database } from "@/lib/supabase/types";

type TableRow = Database["public"]["Tables"]["tables"]["Row"];

function AdminTablesContent() {
  const toast = useToast();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data, error } = await getSupabaseClient().from("tables").select("*").order("label");
    if (error) toast.error(`Couldn't load tables: ${error.message}`);
    else setTables(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setAdding(true);
    try {
      const { error } = await getSupabaseClient().from("tables").insert({ label: newLabel.trim() });
      if (error) throw new Error(error.message);
      toast.success(`${newLabel.trim()} added`);
      setNewLabel("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add table");
    } finally {
      setAdding(false);
    }
  }

  async function saveLabel(row: TableRow) {
    if (!editDraft.trim()) return;
    setBusyId(row.id);
    try {
      const { error } = await getSupabaseClient().from("tables").update({ label: editDraft.trim() }).eq("id", row.id);
      if (error) throw new Error(error.message);
      toast.success("Table renamed");
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't rename table");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(row: TableRow) {
    setBusyId(row.id);
    try {
      const { error } = await getSupabaseClient().from("tables").update({ is_active: !row.is_active }).eq("id", row.id);
      if (error) throw new Error(error.message);
      toast.success(row.is_active ? `${row.label} deactivated` : `${row.label} reactivated`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update table");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Tables" subtitle="The tables and counters staff pick from when opening a tab." />

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : tables.length === 0 ? (
          <EmptyState title="No tables yet" hint="Add the first one below." />
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {tables.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 py-2.5">
                {editingId === t.id ? (
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
                      <Button size="sm" loading={busyId === t.id} onClick={() => saveLabel(t)}>
                        Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {t.label}
                      <Badge variant={t.is_active ? "success" : "neutral"}>{t.is_active ? "Active" : "Inactive"}</Badge>
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(t.id);
                          setEditDraft(t.label);
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busyId === t.id}
                        onClick={() => toggleActive(t)}
                        className={t.is_active ? "text-red-600 hover:text-red-700" : ""}
                      >
                        {t.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-base font-semibold">Add a table</h2>
        <form onSubmit={addTable} className="flex gap-2">
          <Input placeholder="e.g. Table 7, Bar 2" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Button type="submit" loading={adding}>
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}

export default function AdminTablesPage() {
  return (
    <RequireAdmin>
      <AdminTablesContent />
    </RequireAdmin>
  );
}
