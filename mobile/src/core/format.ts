/**
 * Time formatting.
 *
 * Every timestamp in the UI is rendered here so that the same instant reads
 * identically everywhere, in the device's own time zone, and so tests can pin a
 * time zone instead of depending on the machine running them.
 */

export type FormatOptions = {
  /** IANA zone. The app passes the device zone; tests pass 'UTC'. */
  timeZone?: string;
  locale?: string;
  /** Reference point for "Today"/"Yesterday". Defaults to `ts`. */
  now?: number;
};

function partsOf(ts: number, timeZone: string, locale: string) {
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const part of fmt.formatToParts(ts)) out[part.type] = part.value;
  return out;
}

function dayKey(ts: number, timeZone: string) {
  const p = partsOf(ts, timeZone, 'en-GB');
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * "Today 14:32" / "Yesterday 09:05" / "26 Oct, 21:40".
 * Never returns a bare time without a date context, so a timestamp can never be
 * mistaken for right now.
 */
export function formatTimestamp(ts: number, options: FormatOptions = {}): string {
  if (!Number.isFinite(ts)) return 'unknown time';
  const timeZone = options.timeZone ?? 'UTC';
  const locale = options.locale ?? 'en-GB';
  const now = options.now ?? Date.now();

  const p = partsOf(ts, timeZone, locale);
  const clock = `${p.hour}:${p.minute}`;

  const today = dayKey(now, timeZone);
  const that = dayKey(ts, timeZone);
  const yesterday = dayKey(now - 86_400_000, timeZone);

  if (that === today) return `Today ${clock}`;
  if (that === yesterday) return `Yesterday ${clock}`;
  return `${p.day} ${p.month}, ${clock}`;
}

/** For the check-in button and activity lines. */
export function formatClock(ts: number, options: FormatOptions = {}): string {
  const p = partsOf(ts, options.timeZone ?? 'UTC', options.locale ?? 'en-GB');
  return `${p.hour}:${p.minute}`;
}

/** A fix is never shown without both of these. */
export function describeFixForDisplay(
  capturedAt: number,
  accuracyM: number,
  options: FormatOptions = {},
): string {
  const acc = Number.isFinite(accuracyM) ? `±${Math.round(accuracyM)} m` : 'accuracy unknown';
  return `${formatTimestamp(capturedAt, options)} · ${acc}`;
}
