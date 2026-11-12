"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { useToast } from "../_components/Toast";
import { Badge } from "../_components/Badge";
import { Button } from "../_components/Button";
import { Input, Select } from "../_components/Field";
import { PageHeader } from "../_components/PageHeader";
import { SkeletonGrid } from "../_components/Skeleton";
import { EmptyState } from "../_components/EmptyState";
import { formatKES, formatTime } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";

type TabRow = Database["public"]["Tables"]["tabs"]["Row"];
type TableRow = Database["public"]["Tables"]["tables"]["Row"];
type TabTotal = Database["public"]["Views"]["tab_totals"]["Row"];

export default function TabsPage() {
  const router = useRouter();
  const session = useStaffSession();
  const toast = useToast();

  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [totals, setTotals] = useState<Record<string, TabTotal>>({});
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [opening, setOpening] = useState(false);
  const [newTableId, setNewTableId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);

  async function loadAll() {
    const supabase = getSupabaseClient();
    const { data: tabRows, error: tabError } = await supabase
      .from("tabs")
      .select("*")
      .in("status", ["open", "pending_payment"])
      .order("opened_at", { ascending: false });
    if (tabError) {
      toast.error(`Couldn't load tabs: ${tabError.message}`);
      setLoading(false);
      return;
    }
    const openIds = (tabRows ?? []).map((t) => t.id);
    const [{ data: totalRows, error: totalError }, { data: tableRows, error: tableError }] = await Promise.all([
      openIds.length > 0
        ? supabase.from("tab_totals").select("*").in("tab_id", openIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("tables").select("*").eq("is_active", true).order("label"),
    ]);
    if (totalError || tableError) {
      toast.error(`Couldn't load tab totals: ${totalError?.message ?? tableError?.message}`);
      setLoading(false);
      return;
    }
    setTabs(tabRows ?? []);
    setTotals(Object.fromEntries((totalRows ?? []).map((t) => [t.tab_id as string, t])));
    setTables(tableRows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const id = crypto.randomUUID();
      const { error } = await getSupabaseClient()
        .from("tabs")
        .insert({
          id,
          table_id: newTableId || null,
          label: newTableId ? null : newLabel.trim(),
          status: "open",
          opened_by: session.staff_id,
        });
      if (error) throw new Error(error.message);
      setNewTableId("");
      setNewLabel("");
      router.push(`/tabs/${id}`);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Failed to open tab");
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Tabs" subtitle="Open a new tab or jump back into one that's already running." />

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-base font-semibold">Open a tab</h2>
        <form onSubmit={openTab} className="flex flex-wrap items-center gap-3">
          <Select
            value={newTableId}
            onChange={(e) => {
              setNewTableId(e.target.value);
              if (e.target.value) setNewLabel("");
            }}
          >
            <option value="">Pick a table...</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
          <span className="text-sm text-ink-muted">or</span>
          <Input
            placeholder="Custom label (e.g. walk-in)"
            value={newLabel}
            onChange={(e) => {
              setNewLabel(e.target.value);
              if (e.target.value) setNewTableId("");
            }}
            className="min-w-0 flex-1"
          />
          <Button type="submit" loading={opening}>
            Open tab
          </Button>
        </form>
        {openError && <p className="mt-3 text-sm text-red-600">{openError}</p>}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-base font-semibold">Open tabs</h2>
        {loading ? (
          <SkeletonGrid count={3} />
        ) : tabs.length === 0 ? (
          <EmptyState title="No open tabs right now" hint="Open one above to start taking orders." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tabs.map((tab) => {
              const total = totals[tab.id];
              const table = tables.find((t) => t.id === tab.table_id);
              return (
                <button
                  key={tab.id}
                  onClick={() => router.push(`/tabs/${tab.id}`)}
                  className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-raised p-4 text-left shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{table?.label ?? tab.label ?? "Tab"}</span>
                    {tab.status === "pending_payment" && <Badge variant="warning">Awaiting payment</Badge>}
                  </div>
                  <span className="text-xs text-ink-muted">Opened {formatTime(tab.opened_at)}</span>
                  <span className="tabular mt-2 text-lg font-semibold text-brand-700 dark:text-brand-300">
                    {formatKES(total?.balance ?? 0)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
