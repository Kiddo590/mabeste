"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Button } from "../../../_components/Button";
import { SkeletonRows } from "../../../_components/Skeleton";
import { useToast } from "../../../_components/Toast";
import { formatDateTime, formatKES } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";

type TabRow = Database["public"]["Tables"]["tabs"]["Row"] & { tables: { label: string } | null };
type TabTotal = Database["public"]["Views"]["tab_totals"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

type ReceiptLine = {
  id: string;
  name: string;
  size: string | null;
  quantity: number;
  unit_price: number;
};

function ReceiptContent() {
  const { tabId } = useParams<{ tabId: string }>();
  const toast = useToast();

  const [tab, setTab] = useState<TabRow | null>(null);
  const [total, setTotal] = useState<TabTotal | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [servedBy, setServedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseClient();
      try {
        const [tabResult, totalResult, itemsResult, paymentsResult] = await Promise.all([
          supabase.from("tabs").select("*, tables(label)").eq("id", tabId).single(),
          supabase.from("tab_totals").select("*").eq("tab_id", tabId).maybeSingle(),
          supabase
            .from("order_items")
            .select("id, quantity, unit_price, products(name, size), orders!inner(tab_id)")
            .eq("orders.tab_id", tabId)
            .eq("line_status", "active")
            .order("created_at"),
          supabase.from("payments").select("*").eq("tab_id", tabId).order("created_at"),
        ]);
        if (tabResult.error) throw new Error(tabResult.error.message);
        const tabRow = tabResult.data as unknown as TabRow;
        setTab(tabRow);
        setTotal(totalResult.data);
        setLines(
          (
            (itemsResult.data ?? []) as unknown as {
              id: string;
              quantity: number;
              unit_price: number;
              products: { name: string; size: string | null } | null;
            }[]
          ).map((i) => ({
            id: i.id,
            name: i.products?.name ?? "Unknown",
            size: i.products?.size ?? null,
            quantity: i.quantity,
            unit_price: i.unit_price,
          }))
        );
        setPayments(paymentsResult.data ?? []);
        if (tabRow.opened_by) {
          const { data: staffRow } = await supabase
            .from("staff")
            .select("name")
            .eq("id", tabRow.opened_by)
            .maybeSingle();
          setServedBy(staffRow?.name ?? null);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't load receipt");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  function buildShareText() {
    const parts = [
      "Mabeshte POS",
      tab?.tables?.label ?? tab?.label ?? "Tab",
      tab ? formatDateTime(tab.opened_at) : "",
      "",
      ...lines.map(
        (l) => `${l.quantity}x ${l.name}${l.size ? ` (${l.size})` : ""} - ${formatKES(l.quantity * l.unit_price)}`
      ),
      "",
      `Total: ${formatKES(total?.items_total ?? 0)}`,
      `Paid: ${formatKES(total?.paid_total ?? 0)}`,
    ];
    return parts.join("\n");
  }

  async function share() {
    const text = buildShareText();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Mabeshte POS receipt", text });
        return;
      } catch {
        // user cancelled or share isn't supported for this payload — fall
        // through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Receipt copied to clipboard");
    } catch {
      toast.error("Couldn't share or copy the receipt");
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (!tab) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-medium">Receipt not found</p>
        <Link href="/tabs" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
          &larr; Back to tabs
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-4 p-4 md:p-6">
      <div className="no-print flex w-full max-w-[80mm] items-center justify-between">
        <Link href={`/tabs/${tab.id}`} className="text-sm text-ink-muted hover:text-brand-600 dark:hover:text-brand-400">
          &larr; Back
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={share}>
            Share
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <div className="w-full max-w-[80mm] rounded-2xl border border-line bg-surface-raised p-5 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="mb-4 text-center">
          <p className="text-lg font-bold text-brand-700 dark:text-brand-300">Mabeshte POS</p>
          <p className="text-xs text-ink-muted">{formatDateTime(tab.opened_at)}</p>
          <p className="mt-1 text-sm font-medium">{tab.tables?.label ?? tab.label ?? "Tab"}</p>
        </div>

        <div className="flex flex-col gap-1.5 border-y border-dashed border-line-strong py-3 text-sm">
          {lines.length === 0 ? (
            <p className="text-center text-ink-muted">No items on this tab.</p>
          ) : (
            lines.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2">
                <span className="flex-1">
                  {l.quantity}&times; {l.name}
                  {l.size && <span className="text-ink-muted"> ({l.size})</span>}
                </span>
                <span className="tabular shrink-0">{formatKES(l.quantity * l.unit_price)}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-1 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-muted">Subtotal</span>
            <span className="tabular">{formatKES(total?.items_total ?? 0)}</span>
          </div>
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span className="text-ink-muted">
                {p.method === "cash" ? "Cash" : "M-Pesa"}
                {p.status !== "completed" && <span className="ml-1">({p.status})</span>}
                {p.mpesa_receipt_number && <span className="ml-1 text-xs">#{p.mpesa_receipt_number}</span>}
              </span>
              <span className="tabular">{formatKES(p.amount)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-line pt-1 text-base font-semibold">
            <span>Balance</span>
            <span className="tabular">{formatKES(total?.balance ?? 0)}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-line-strong pt-3 text-center text-xs text-ink-muted">
          {servedBy && <p>Served by {servedBy}</p>}
          <p className="mt-1">Thank you for your visit!</p>
        </div>
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 md:p-6">
          <SkeletonRows rows={6} />
        </div>
      }
    >
      <ReceiptContent />
    </Suspense>
  );
}
