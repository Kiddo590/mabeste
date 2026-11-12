// Kenya has no daylight-saving time, so a fixed +03:00 offset is exact.
const TZ = "Africa/Nairobi";
const OFFSET = "+03:00";

const kes = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatKES(amount: number): string {
  return `KES ${kes.format(amount)}`;
}

/** Today's (or the given instant's) calendar date in Nairobi, as YYYY-MM-DD. */
export function nairobiDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function nairobiDayStartISO(dateStr: string = nairobiDateString()): string {
  return new Date(`${dateStr}T00:00:00${OFFSET}`).toISOString();
}

export function nairobiDayEndISO(dateStr: string = nairobiDateString()): string {
  return new Date(`${dateStr}T23:59:59.999${OFFSET}`).toISOString();
}

export function nairobiHour(date: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(date));
}

/** Shift a YYYY-MM-DD Nairobi date by N days. */
export function shiftDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00${OFFSET}`);
  d.setUTCDate(d.getUTCDate() + days);
  return nairobiDateString(d);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-KE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${dateStr}T12:00:00${OFFSET}`));
}
