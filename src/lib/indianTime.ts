/**
 * Indian Standard Time (IST, UTC+05:30) Central Authority
 * Ensures consistent date & time representation across Server & Client components.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_LOCALE = 'en-IN';

export function parseDateSafe(input: Date | string | number | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Returns full Indian Date and Time with 12-hour AM/PM and IST badge.
 * Example: "26 Oct 2026, 02:35 PM IST"
 */
export function formatIndianDateTime(
  input: Date | string | number | null | undefined,
  includeSeconds = false
): string {
  const d = parseDateSafe(input);
  if (!d) return '—';

  const datePart = d.toLocaleDateString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const timePart = d.toLocaleTimeString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  });

  return `${datePart}, ${timePart} IST`;
}

/**
 * Returns Indian Date only.
 * Example: "26 Oct 2026"
 */
export function formatIndianDate(
  input: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseDateSafe(input);
  if (!d) return '—';

  return d.toLocaleDateString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

/**
 * Returns Indian Time only.
 * Example: "02:35 PM IST"
 */
export function formatIndianTime(
  input: Date | string | number | null | undefined,
  includeSeconds = false
): string {
  const d = parseDateSafe(input);
  if (!d) return '—';

  const timePart = d.toLocaleTimeString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  });

  return `${timePart} IST`;
}

/**
 * Current Indian Standard Time as a formatted string.
 */
export function getIndianNowFormatted(includeSeconds = true): string {
  return formatIndianDateTime(new Date(), includeSeconds);
}
