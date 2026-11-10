"use client";

import { useSyncExternalStore } from "react";
import { isSessionExpired, subscribeSession, STORAGE_KEY, type StaffSession } from "./session";

// useSyncExternalStore requires getSnapshot to return a referentially stable
// value when nothing has changed; getSession() re-parses JSON on every call,
// which produced a new object each time and tripped React's infinite-loop
// guard. Cache against the raw string so repeat calls with unchanged storage
// return the same reference.
let cachedRaw: string | null = null;
let cachedSession: StaffSession | null = null;

function getSnapshot(): StaffSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSession = raw ? (JSON.parse(raw) as StaffSession) : null;
    } catch {
      cachedSession = null;
    }
  }
  return isSessionExpired(cachedSession) ? null : cachedSession;
}

function getServerSnapshot(): StaffSession | null {
  return null;
}

/** `null` means "no valid session" — covers both logged-out and expired. */
export function useStaffSession(): StaffSession | null {
  return useSyncExternalStore(subscribeSession, getSnapshot, getServerSnapshot);
}
