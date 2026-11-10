"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createStaff } from "@/lib/auth/pin";
import type { Database } from "@/lib/supabase/types";

type StaffRow = Database["public"]["Tables"]["staff"]["Row"];

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"admin" | "cashier">("cashier");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadStaff() {
    const { data, error } = await getSupabaseClient()
      .from("staff")
      .select("*")
      .order("name");
    if (error) setLoadError(error.message);
    else setStaff(data ?? []);
  }

  useEffect(() => {
    getSupabaseClient()
      .from("staff")
      .select("*")
      .order("name")
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else setStaff(data ?? []);
      });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setFormError("PIN must be 4-6 digits");
      return;
    }
    setSubmitting(true);
    try {
      await createStaff({ name, phone: phone || undefined, pin, role });
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
    const { error } = await getSupabaseClient()
      .from("staff")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (!error) loadStaff();
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <section>
        <h1 className="mb-4 text-lg font-semibold">Staff</h1>
        {loadError && <p className="text-red-600">{loadError}</p>}
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="py-2">Name</th>
              <th className="py-2">Phone</th>
              <th className="py-2">Role</th>
              <th className="py-2">Active</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2">{s.name}</td>
                <td className="py-2">{s.phone ?? "—"}</td>
                <td className="py-2">{s.role}</td>
                <td className="py-2">{s.is_active ? "Yes" : "No"}</td>
                <td className="py-2">
                  <button onClick={() => toggleActive(s)} className="text-zinc-500 hover:underline">
                    {s.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="max-w-sm">
        <h2 className="mb-4 text-lg font-semibold">Add staff</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded border border-black/10 px-3 py-2 dark:border-white/10 dark:bg-zinc-900"
          />
          <input
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded border border-black/10 px-3 py-2 dark:border-white/10 dark:bg-zinc-900"
          />
          <input
            placeholder="PIN (4-6 digits)"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            required
            className="rounded border border-black/10 px-3 py-2 dark:border-white/10 dark:bg-zinc-900"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "cashier")}
            className="rounded border border-black/10 px-3 py-2 dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="cashier">Cashier</option>
            <option value="admin">Admin</option>
          </select>
          {formError && <p className="text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {submitting ? "Creating..." : "Create staff"}
          </button>
        </form>
      </section>
    </div>
  );
}
