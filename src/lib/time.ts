/**
 * Instants, in the handful of writings a person actually pastes.
 *
 * There is no timezone database here, on purpose: converting "to
 * America/New_York" would mean shipping one, and this page's job is to
 * translate between Unix time, ISO 8601 and the clock on the machine that
 * opened it. UTC and the browser's local zone are the two that need no table.
 *
 * Parsing is conservative about the unit. A 13-digit number is milliseconds;
 * a 10-digit number is seconds. Confusing the two is a thirty-thousand-year
 * error, and guessing silently is how that error ships.
 */

export type TimeUnit = 's' | 'ms';

export interface ParsedTime {
  readonly date: Date;
  readonly inputUnit: TimeUnit | 'iso' | 'rfc2822' | 'datetime';
  readonly unixSeconds: number;
  readonly unixMs: number;
}

export interface TimeView {
  readonly unixSeconds: string;
  readonly unixMs: string;
  readonly isoUtc: string;
  readonly isoLocal: string;
  readonly rfc2822: string;
  readonly utcHuman: string;
  readonly localHuman: string;
  readonly relative: string;
  readonly timeZone: string;
}

const UNITS: ReadonlyArray<readonly [number, string]> = [
  [60, 'minute'],
  [60, 'hour'],
  [24, 'day'],
  [30, 'month'],
  [12, 'year'],
];

function distance(seconds: number): string {
  let value = Math.abs(seconds);
  let unit = 'second';
  for (const [step, name] of UNITS) {
    if (value < step * 2) break;
    value = Math.round(value / step);
    unit = name;
  }
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

export function relativeTo(then: Date, now: Date): string {
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds === 0) return 'now';
  const amount = distance(seconds);
  return seconds > 0 ? `${amount} ago` : `in ${amount}`;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** Local time as `YYYY-MM-DDTHH:mm:ss.sss`, no zone suffix — datetime-local's shape. */
export function toDateTimeLocal(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}`
  );
}

function fromUnix(n: number, unit: TimeUnit): Date {
  const ms = unit === 'ms' ? n : n * 1000;
  const date = new Date(ms);
  if (!Number.isFinite(ms) || Number.isNaN(date.getTime())) {
    throw new Error('That is not a representable instant.');
  }
  return date;
}

/**
 * Decide seconds vs milliseconds for a bare number.
 *
 * 1e12 ms is 2001-09-09 in milliseconds and the year 33658 in seconds.
 * 1e10 seconds is 2286. Anything whose absolute value is at least 1e12 is
 * treated as milliseconds; anything smaller as seconds. Fractional values
 * (1735689600.5) stay seconds, because that is how Unix time is written.
 */
export function unitForNumber(n: number): TimeUnit {
  return Math.abs(n) >= 1e12 ? 'ms' : 's';
}

const ISO =
  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

export function parseTime(input: string): ParsedTime {
  const trimmed = input.trim();
  if (trimmed === '') throw new Error('Paste a timestamp, an ISO date, or a Unix time.');

  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) throw new Error('That number is not a finite timestamp.');
    const unit = unitForNumber(n);
    const date = fromUnix(n, unit);
    return viewFromDate(date, unit);
  }

  if (DATETIME_LOCAL.test(trimmed) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) throw new Error('That datetime is not representable.');
    return viewFromDate(date, 'datetime');
  }

  if (ISO.test(trimmed)) {
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) throw new Error('That ISO 8601 date is not representable.');
    return viewFromDate(date, 'iso');
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Could not read that as a date. Try Unix seconds, Unix milliseconds, or ISO 8601.');
  }
  return viewFromDate(date, 'rfc2822');
}

function viewFromDate(date: Date, inputUnit: ParsedTime['inputUnit']): ParsedTime {
  const unixMs = date.getTime();
  return {
    date,
    inputUnit,
    unixSeconds: unixMs / 1000,
    unixMs,
  };
}

const UTC_HUMAN = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'full',
  timeStyle: 'long',
  timeZone: 'UTC',
});

export function formatTime(parsed: ParsedTime, now = new Date()): TimeView {
  const { date } = parsed;
  const localHuman = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(date);
  const timeZone =
    new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'local';

  return {
    unixSeconds: String(Math.trunc(parsed.unixSeconds)),
    unixMs: String(parsed.unixMs),
    isoUtc: date.toISOString(),
    isoLocal: toDateTimeLocal(date),
    rfc2822: date.toUTCString(),
    utcHuman: UTC_HUMAN.format(date),
    localHuman,
    relative: relativeTo(date, now),
    timeZone,
  };
}
