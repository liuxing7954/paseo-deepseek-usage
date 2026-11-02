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
function beijingDate(t: number): string {
  const shifted = new Date(t + BEIJING_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Three call sites read this membership test, and the set is the only definition of a holiday. */
function isHoliday(t: number): boolean {
  return holidayDays.has(beijingDate(t));
}

export function phaseAt(t: number): PricingPhase {
  const utc = new Date(t);
  // The published schedule is UTC Monday-Friday. Only the holiday table is a Beijing-calendar
  // concept: the two peak windows (01:00-10:00 UTC) always fall on the same Beijing date.
  const weekday = utc.getUTCDay();
  if (weekday === 0 || weekday === 6 || isHoliday(t)) return "offPeak";
  const minutes = utc.getUTCHours() * 60 + utc.getUTCMinutes();
  const peak = PEAK_WINDOWS_MINUTES.some(([start, end]) => minutes >= start && minutes < end);
  return peak ? "peak" : "offPeak";
}

function reasonAt(t: number, phase: PricingPhase): PhaseReason {
  if (phase === "peak") return "weekdayWindow";
  if (isHoliday(t)) return "holiday";
  const weekday = new Date(t).getUTCDay();
  if (weekday === 0 || weekday === 6) return "weekend";
  return "outsideWindow";
}

/**
 * The only instants at which the phase can change: the four edges of the two peak windows. Weekday
 * and holiday changes happen outside those windows, so they never flip the phase by themselves. That
 * makes a scan over these candidates exact rather than a heuristic.
 */
const TRANSITION_MINUTES: readonly number[] = PEAK_WINDOWS_MINUTES.flatMap(([start, end]) => [
  start,
  end,
]);

/** A Chinese holiday plus its surrounding weekend is well under three weeks. */
const SEARCH_DAYS = 21;

/**
 * The current phase and the next instant it flips.
 *
 * The old minute-by-minute scan capped at seven days, which silently returned "now" during the nine
 * day Spring Festival holiday (and at the edge of National Day). Scanning the real transition
 * boundaries is both exact and far cheaper: at most four checks per day.
 */
export function pricingState(now: number): PricingState {
  const phase = phaseAt(now);
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;

  for (let day = 0; day <= SEARCH_DAYS; day += 1) {
    for (const minute of TRANSITION_MINUTES) {
      const t = dayStart + day * DAY_MS + minute * 60_000;
      if (t <= now) continue;
      if (phaseAt(t) !== phase) {
        return { phase, reason: reasonAt(now, phase), nextChangeAt: new Date(t) };
      }
    }
  }

  // The schedule always transitions within three weeks; keep a boundary rather than "now" if the
  // holiday table is ever malformed.
  const lastCandidate = dayStart + SEARCH_DAYS * DAY_MS + TRANSITION_MINUTES[TRANSITION_MINUTES.length - 1]! * 60_000;
  return { phase, reason: reasonAt(now, phase), nextChangeAt: new Date(lastCandidate) };
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
