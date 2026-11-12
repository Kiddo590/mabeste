"use client";

import { Fragment, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createStaff, resetStaffPin } from "@/lib/auth/pin";
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; phone: string; role: "admin" | "cashier" }>({
    name: "",
    phone: "",
    role: "cashier",
  });
  const [editSaving, setEditSaving] = useState(false);

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

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

  function startEdit(row: StaffRow) {
    setResettingId(null);
    setEditingId(row.id);
    setEditDraft({ name: row.name, phone: row.phone ?? "", role: row.role as "admin" | "cashier" });
  }

  async function saveEdit(row: StaffRow) {
    if (!editDraft.name.trim()) {
      toast.error("Name can't be empty");
      return;
    }
    if (row.id === session?.staff_id && editDraft.role !== "admin") {
      toast.error("You can't change your own role");
      return;
    }
    setEditSaving(true);
    try {
      const { error } = await getSupabaseClient()
        .from("staff")
        .update({ name: editDraft.name.trim(), phone: editDraft.phone.trim() || null, role: editDraft.role })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      toast.success(`${editDraft.name.trim()} updated`);
      setEditingId(null);
      await loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save changes");
    } finally {
      setEditSaving(false);
    }
  }

  function startReset(row: StaffRow) {
    setEditingId(null);
    setResettingId(row.id);
    setPinDraft("");
    setPinError(null);
  }

  async function saveReset(row: StaffRow) {
    if (!/^\d{4,6}$/.test(pinDraft)) {
      setPinError("PIN must be 4–6 digits");
      return;
    }
    setPinSaving(true);
    try {
      await resetStaffPin(row.id, pinDraft);
      toast.success(`PIN reset for ${row.name}`);
      setResettingId(null);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Couldn't reset PIN");
    } finally {
      setPinSaving(false);
    }
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
                  <Fragment key={s.id}>
                    <tr className="border-b border-line last:border-0">
                      {editingId === s.id ? (
                        <>
                          <td className="py-2 pr-4">
                            <Input
                              value={editDraft.name}
                              onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                              className="min-w-[8rem]"
                            />
                          </td>
                          <td className="py-2 pr-4">
                            <Input
                              value={editDraft.phone}
                              onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
                              placeholder="Phone"
                              className="min-w-[8rem]"
                            />
                          </td>
                          <td className="py-2 pr-4">
                            <Select
                              value={editDraft.role}
                              onChange={(e) => setEditDraft((d) => ({ ...d, role: e.target.value as "admin" | "cashier" }))}
                              disabled={s.id === session?.staff_id}
                            >
                              <option value="cashier">Cashier</option>
                              <option value="admin">Admin</option>
                            </Select>
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge variant={s.is_active ? "success" : "neutral"}>{s.is_active ? "Active" : "Inactive"}</Badge>
                          </td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                            <Button size="sm" loading={editSaving} onClick={() => saveEdit(s)}>
                              Save
                            </Button>
                          </td>
                        </>
                      ) : (
                        <>
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
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => startReset(s)}>
                              Reset PIN
                            </Button>
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
                        </>
                      )}
                    </tr>
                    {resettingId === s.id && (
                      <tr className="border-b border-line bg-surface-sunken last:border-0">
                        <td colSpan={5} className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-ink-muted">New PIN for {s.name}:</span>
                            <Input
                              value={pinDraft}
                              onChange={(e) => setPinDraft(e.target.value)}
                              inputMode="numeric"
                              placeholder="4–6 digits"
                              className="w-32"
                            />
                            <Button variant="ghost" size="sm" onClick={() => setResettingId(null)}>
                              Cancel
                            </Button>
                            <Button size="sm" loading={pinSaving} onClick={() => saveReset(s)}>
                              Set PIN
                            </Button>
                            {pinError && <span className="text-sm text-red-600">{pinError}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
