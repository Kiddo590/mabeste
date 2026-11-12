// Normalizes the Kenyan phone formats a staff member is likely to type
// (07XX…, 01XX…, +254…, 254…, or a bare 7XX…/1XX… without the leading 0)
// into the 254XXXXXXXXX shape Daraja requires. Returns null when the input
// isn't a recognizable Kenyan mobile number.
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

export function formatKenyanPhoneForDisplay(normalized: string): string {
  if (!/^254\d{9}$/.test(normalized)) return normalized;
  return `0${normalized.slice(3, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8)}`;
}
