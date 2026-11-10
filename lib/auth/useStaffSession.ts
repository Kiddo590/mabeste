"use client";

import { useSyncExternalStore } from "react";
import { getSession, isSessionExpired, subscribeSession, type StaffSession } from "./session";

function getSnapshot(): StaffSession | null {
  const session = getSession();
  return isSessionExpired(session) ? null : session;
}

function getServerSnapshot(): StaffSession | null {
  return null;
}

/** `null` means "no valid session" — covers both logged-out and expired. */
export function useStaffSession(): StaffSession | null {
  return useSyncExternalStore(subscribeSession, getSnapshot, getServerSnapshot);
}
