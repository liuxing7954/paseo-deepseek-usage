/**
 * DeepSeek API price windows.
 *
 * Source: https://api-docs.deepseek.com/quick_start/pricing
 * "Off-peak rates are half of the peak rates. Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC,
 * Monday through Friday, excluding Chinese public holidays. All other hours are off-peak, including
 * weekends and Chinese public holidays in full."
 *
 * Everything here is a plain value or a pure function so both the daemon bundle and the app bundle
 * can use it: no Node APIs, no React.
 */

export type PricingPhase = "peak" | "offPeak";

/** Why the current phase holds, so the UI can name it instead of only colouring it. */
export type PhaseReason = "weekdayWindow" | "outsideWindow" | "weekend" | "holiday";

export interface PricingState {
  phase: PricingPhase;
  reason: PhaseReason;
  /** First minute at which `phase` stops holding. */
  nextChangeAt: Date;
}

/** Peak pricing windows, in minutes from 00:00 UTC: 01:00-04:00 and 06:00-10:00. */
const PEAK_WINDOWS_MINUTES: ReadonlyArray<readonly [number, number]> = [
  [60, 240],
  [360, 600],
];

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Chinese public holidays, as inclusive `[first day, last day]` ranges in Beijing dates.
 * Weekends inside a range are already off-peak; the range is kept whole so it stays readable.
 *
 * 2026 comes from 国办发明电〔2025〕7号 (the State Council notice published 2025-11-04). Extend this
 * table when the next notice is published; a date missing here is treated as an ordinary weekday,
 * which only affects whether a peak window is charged on a holiday.
 */
const CHINA_HOLIDAY_RANGES: ReadonlyArray<readonly [string, string]> = [
  ["2026-01-01", "2026-01-03"], // New Year
  ["2026-02-15", "2026-02-23"], // Spring Festival
  ["2026-04-04", "2026-04-06"], // Qingming
  ["2026-05-01", "2026-05-05"], // Labour Day
  ["2026-06-19", "2026-06-21"], // Dragon Boat
  ["2026-09-25", "2026-09-27"], // Mid-Autumn
  ["2026-10-01", "2026-10-07"], // National Day
];

const DAY_MS = 24 * 60 * 60 * 1000;

const holidayDays: ReadonlySet<string> = new Set(
  CHINA_HOLIDAY_RANGES.flatMap(([first, last]) => {
    const days: string[] = [];
    const start = Date.parse(`${first}T00:00:00Z`);
    const end = Date.parse(`${last}T00:00:00Z`);
    for (let t = start; t <= end; t += DAY_MS) days.push(new Date(t).toISOString().slice(0, 10));
    return days;
  }),
);

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Beijing calendar date of an instant, as `YYYY-MM-DD`. */
function beijingDate(t: number): { key: string; weekday: number } {
  const shifted = new Date(t + BEIJING_OFFSET_MS);
  const key = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  return { key, weekday: shifted.getUTCDay() };
}

/** Three call sites read this membership test, and the set is the only definition of a holiday. */
function isHoliday(t: number): boolean {
  return holidayDays.has(beijingDate(t).key);
}

export function phaseAt(t: number): PricingPhase {
  const { weekday } = beijingDate(t);
  if (weekday === 0 || weekday === 6 || isHoliday(t)) return "offPeak";
  const utc = new Date(t);
  const minutes = utc.getUTCHours() * 60 + utc.getUTCMinutes();
  const peak = PEAK_WINDOWS_MINUTES.some(([start, end]) => minutes >= start && minutes < end);
  return peak ? "peak" : "offPeak";
}

function reasonAt(t: number, phase: PricingPhase): PhaseReason {
  if (phase === "peak") return "weekdayWindow";
  const { weekday } = beijingDate(t);
  if (isHoliday(t)) return "holiday";
  if (weekday === 0 || weekday === 6) return "weekend";
  return "outsideWindow";
}

const SEARCH_MINUTES = 7 * 24 * 60;

/**
 * The current phase and the minute it flips. A minute-by-minute scan is far cheaper to keep correct
 * than deriving the next boundary from five separate cases, and it runs once per fetch or render.
 */
export function pricingState(now: number): PricingState {
  const phase = phaseAt(now);
  const minute = 60 * 1000;
  const nextBoundary = Math.ceil(now / minute) * minute;
  for (let step = 0; step <= SEARCH_MINUTES; step += 1) {
    const t = nextBoundary + step * minute;
    if (phaseAt(t) !== phase) {
      return { phase, reason: reasonAt(now, phase), nextChangeAt: new Date(t) };
    }
  }
  return { phase, reason: reasonAt(now, phase), nextChangeAt: new Date(nextBoundary) };
}

/** `1h 20m`, `45m`, `2d 3h`: short enough for a sidebar row. */
export function countdownLabel(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Local wall-clock time of an instant, with the weekday only when it is not today. */
export function clockLabel(at: Date, now: number): string {
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const today = new Date(now);
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate();
  return sameDay ? time : `${WEEKDAYS[at.getDay()]} ${time}`;
}

/** Prices per 1M tokens, in USD, exactly as the pricing page states them. */
export const PRICES: ReadonlyArray<{
  model: string;
  peak: { cacheHit: string; cacheMiss: string; output: string };
  offPeak: { cacheHit: string; cacheMiss: string; output: string };
}> = [
  {
    model: "deepseek-flash",
    peak: { cacheHit: "$0.006", cacheMiss: "$0.3", output: "$1.2" },
    offPeak: { cacheHit: "$0.003", cacheMiss: "$0.15", output: "$0.6" },
  },
  {
    model: "deepseek-v4-pro",
    peak: { cacheHit: "$0.044", cacheMiss: "$1.32", output: "$3.96" },
    offPeak: { cacheHit: "$0.022", cacheMiss: "$0.66", output: "$1.98" },
  },
];
