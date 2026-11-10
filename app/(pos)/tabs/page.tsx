"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import type { Database } from "@/lib/supabase/types";

type TabRow = Database["public"]["Tables"]["tabs"]["Row"];
type TableRow = Database["public"]["Tables"]["tables"]["Row"];
type TabTotal = Database["public"]["Views"]["tab_totals"]["Row"];

export default function TabsPage() {
  const session = useStaffSession();
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [totals, setTotals] = useState<Record<string, TabTotal>>({});
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [opening, setOpening] = useState(false);
  const [newTableId, setNewTableId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);

  async function loadAll() {
    const supabase = getSupabaseClient();
    const [{ data: tabRows, error: tabError }, { data: totalRows, error: totalError }, { data: tableRows, error: tableError }] =
      await Promise.all([
        supabase.from("tabs").select("*").in("status", ["open", "pending_payment"]).order("opened_at", { ascending: false }),
        supabase.from("tab_totals").select("*"),
        supabase.from("tables").select("*").eq("is_active", true).order("label"),
      ]);
    if (tabError || totalError || tableError) {
      setLoadError(tabError?.message ?? totalError?.message ?? tableError?.message ?? "Failed to load tabs");
      return;
    }
    setTabs(tabRows ?? []);
    setTotals(Object.fromEntries((totalRows ?? []).map((t) => [t.tab_id as string, t])));
    setTables(tableRows ?? []);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function openTab(e: React.FormEvent) {
    e.preventDefault();
    setOpenError(null);
    if (!newTableId && !newLabel.trim()) {
      setOpenError("Pick a table or enter a label");
      return;
    }
    if (!session) return;
    setOpening(true);
    try {
      const { error } = await getSupabaseClient()
        .from("tabs")
        .insert({
          id: crypto.randomUUID(),
          table_id: newTableId || null,
          label: newTableId ? null : newLabel.trim(),
          status: "open",
          opened_by: session.staff_id,
        });
      if (error) throw new Error(error.message);
      setNewTableId("");
      setNewLabel("");
      await loadAll();
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Failed to open tab");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h1 className="mb-4 text-lg font-semibold">Open a tab</h1>
        <form onSubmit={openTab} className="flex flex-wrap items-center gap-3">
          <select
            value={newTableId}
            onChange={(e) => {
              setNewTableId(e.target.value);
              if (e.target.value) setNewLabel("");
            }}
            className="rounded border border-black/10 px-3 py-2 text-sm focus:border-brand-500/50 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:focus:border-brand-400/40"
          >
            <option value="">Pick a table...</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-zinc-400">or</span>
          <input
            placeholder="Custom label (e.g. walk-in)"
            value={newLabel}
            onChange={(e) => {
              setNewLabel(e.target.value);
              if (e.target.value) setNewTableId("");
            }}
            className="min-w-0 flex-1 rounded border border-black/10 px-3 py-2 text-sm focus:border-brand-500/50 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:focus:border-brand-400/40"
          />
          <button
            type="submit"
            disabled={opening}
            className="rounded bg-gold-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-700 disabled:opacity-50 dark:bg-gold-500 dark:text-black dark:hover:bg-gold-400"
          >
            {opening ? "Opening..." : "Open tab"}
          </button>
        </form>
        {openError && <p className="mt-3 text-red-600">{openError}</p>}
        {loadError && <p className="mt-3 text-red-600">{loadError}</p>}
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">Open tabs</h2>
        {tabs.length === 0 ? (
          <p className="text-sm text-zinc-500">No open tabs right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tabs.map((tab) => {
              const total = totals[tab.id];
              const table = tables.find((t) => t.id === tab.table_id);
              return (
                <Link
                  key={tab.id}
                  href={`/tabs/${tab.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-black/10 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-white/10"
                >
                  <span className="font-medium">{table?.label ?? tab.label ?? "Tab"}</span>
                  <span className="text-xs text-zinc-500">
                    {tab.status === "pending_payment" ? "Awaiting payment" : "Open"}
                  </span>
                  <span className="mt-2 text-lg font-semibold text-brand-700 dark:text-brand-300">
                    KES {(total?.balance ?? 0).toFixed(2)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
