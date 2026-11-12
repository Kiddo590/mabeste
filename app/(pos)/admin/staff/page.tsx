"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createStaff } from "@/lib/auth/pin";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { RequireAdmin } from "../../_components/RequireAdmin";
import { useToast } from "../../_components/Toast";
import { useConfirm } from "../../_components/ConfirmDialog";
import { Badge } from "../../_components/Badge";
import { Button } from "../../_components/Button";
import { Input, Select } from "../../_components/Field";
import { PageHeader } from "../../_components/PageHeader";
import { SkeletonRows } from "../../_components/Skeleton";
import { EmptyState } from "../../_components/EmptyState";
import type { Database } from "@/lib/supabase/types";

type StaffRow = Database["public"]["Tables"]["staff"]["Row"];

function AdminStaffContent() {
  const session = useStaffSession();
  const toast = useToast();
  const confirm = useConfirm();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"admin" | "cashier">("cashier");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadStaff() {
    const { data, error } = await getSupabaseClient().from("staff").select("*").order("name");
    if (error) toast.error(`Couldn't load staff: ${error.message}`);
    else setStaff(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setFormError("PIN must be 4–6 digits");
      return;
    }
    setSubmitting(true);
    try {
      await createStaff({ name: name.trim(), phone: phone.trim() || undefined, pin, role });
      toast.success(`${name.trim()} added`);
      setName("");
      setPhone("");
      setPin("");
      setRole("cashier");
      await loadStaff();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create staff");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(row: StaffRow) {
    if (row.is_active && row.id === session?.staff_id) {
      toast.error("You can't deactivate your own account");
      return;
    }
    if (row.is_active) {
      const ok = await confirm({
        title: `Deactivate ${row.name}?`,
        message: "They won't be able to log in until reactivated. Their past sales stay on record.",
        confirmLabel: "Deactivate",
        danger: true,
      });
      if (!ok) return;
    }
    setBusyId(row.id);
    const { error } = await getSupabaseClient()
      .from("staff")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast.error(`Couldn't update ${row.name}: ${error.message}`);
      return;
    }
    toast.success(row.is_active ? `${row.name} deactivated` : `${row.name} reactivated`);
    await loadStaff();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Staff" subtitle="Who can sign in to the till, and what they can do." />

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : staff.length === 0 ? (
          <EmptyState title="No staff yet" hint="Add the first staff member below." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Phone</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-4 font-medium">
                      {s.name}
                      {s.id === session?.staff_id && <span className="ml-1 text-xs text-ink-muted">(you)</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-muted">{s.phone ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={s.role === "admin" ? "brand" : "neutral"}>
                        {s.role === "admin" ? "Admin" : "Cashier"}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={s.is_active ? "success" : "neutral"}>{s.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busyId === s.id}
                        onClick={() => toggleActive(s)}
                        className={s.is_active ? "text-red-600 hover:text-red-700" : ""}
                      >
                        {s.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-base font-semibold">Add staff</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input
            placeholder="PIN (4–6 digits)"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            required
          />
          <Select value={role} onChange={(e) => setRole(e.target.value as "admin" | "cashier")}>
            <option value="cashier">Cashier</option>
            <option value="admin">Admin</option>
          </Select>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <Button type="submit" loading={submitting}>
            Create staff
          </Button>
        </form>
      </section>
    </div>
  );
}

export default function AdminStaffPage() {
  return (
    <RequireAdmin>
      <AdminStaffContent />
    </RequireAdmin>
  );
}
