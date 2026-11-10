"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listStaffForPicker, loginWithPin, type StaffListEntry } from "@/lib/auth/pin";

export default function LoginPage() {
  const router = useRouter();
  const [staffList, setStaffList] = useState<StaffListEntry[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    listStaffForPicker()
      .then(setStaffList)
      .catch(() => setListError("Couldn't load staff list — check your connection."));
  }, []);

  function pressDigit(d: string) {
    if (pin.length >= 6) return;
    setError(null);
    setPin((p) => p + d);
  }

  function backspace() {
    setError(null);
    setPin((p) => p.slice(0, -1));
  }

  async function submit() {
    if (!selectedStaffId || pin.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      await loginWithPin(selectedStaffId, pin);
      router.push("/tabs");
    } catch {
      setError("Incorrect PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  if (!selectedStaffId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
        <h1 className="text-2xl font-semibold">Mabeste POS</h1>
        {listError && <p className="text-red-600">{listError}</p>}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {staffList.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStaffId(s.id)}
              className="rounded-xl border border-black/10 bg-white px-8 py-6 text-lg font-medium shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const selectedName = staffList.find((s) => s.id === selectedStaffId)?.name;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <button
        onClick={() => {
          setSelectedStaffId(null);
          setPin("");
          setError(null);
        }}
        className="self-start text-sm text-zinc-500 hover:underline"
      >
        &larr; Back
      </button>
      <h1 className="text-xl font-semibold">{selectedName}</h1>
      <div className="flex gap-3" aria-label="PIN entry">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border border-black/30 dark:border-white/30 ${
              i < pin.length ? "bg-black dark:bg-white" : ""
            }`}
          />
        ))}
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <div className="grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onClick={() => pressDigit(d)}
            disabled={loading}
            className="h-16 w-16 rounded-full border border-black/10 text-xl font-medium active:bg-zinc-100 dark:border-white/10 dark:active:bg-zinc-800"
          >
            {d}
          </button>
        ))}
        <button
          onClick={backspace}
          disabled={loading}
          className="h-16 w-16 rounded-full text-sm text-zinc-500"
        >
          Delete
        </button>
        <button
          onClick={() => pressDigit("0")}
          disabled={loading}
          className="h-16 w-16 rounded-full border border-black/10 text-xl font-medium active:bg-zinc-100 dark:border-white/10 dark:active:bg-zinc-800"
        >
          0
        </button>
        <button
          onClick={submit}
          disabled={loading || pin.length < 4}
          className="h-16 w-16 rounded-full bg-black text-sm font-medium text-white disabled:opacity-30 dark:bg-white dark:text-black"
        >
          {loading ? "..." : "Go"}
        </button>
      </div>
    </div>
  );
}
