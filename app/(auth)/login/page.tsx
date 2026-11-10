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
        <h1 className="text-2xl font-semibold">
          Mabeste <span className="text-amber-600 dark:text-amber-400">POS</span>
        </h1>
        {listError && <p className="text-red-600">{listError}</p>}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {staffList.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStaffId(s.id)}
              className="rounded-xl border border-black/10 bg-white px-8 py-6 text-lg font-medium shadow-sm transition-colors hover:border-amber-500/50 hover:bg-amber-50 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-amber-400/40 dark:hover:bg-amber-950/20"
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
            className={`h-4 w-4 rounded-full border border-amber-500/40 dark:border-amber-400/40 ${
              i < pin.length ? "bg-amber-500 dark:bg-amber-400" : ""
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
            className="h-16 w-16 rounded-full border border-black/10 text-xl font-medium active:border-amber-500/40 active:bg-amber-50 dark:border-white/10 dark:active:border-amber-400/30 dark:active:bg-amber-950/30"
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
          className="h-16 w-16 rounded-full border border-black/10 text-xl font-medium active:border-amber-500/40 active:bg-amber-50 dark:border-white/10 dark:active:border-amber-400/30 dark:active:bg-amber-950/30"
        >
          0
        </button>
        <button
          onClick={submit}
          disabled={loading || pin.length < 4}
          className="h-16 w-16 rounded-full bg-amber-600 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-30 dark:bg-amber-500 dark:text-black dark:hover:bg-amber-400"
        >
          {loading ? "..." : "Go"}
        </button>
      </div>
    </div>
  );
}
