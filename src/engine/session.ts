import type { SessionState } from "./types";

export interface MarketStates {
  market: string;
  daylightType: string; // not trusted; DST is computed locally
  stateList: { state: string; timeZone: string; startTime: string; endTime: string }[];
}
export interface Calendar {
  timeZone: string;
  specificConfig: { remark: string; startTime: string; endTime: string }[];
  regularConfig: string[];
}

const NY = "America/New_York";
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NY, hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
});

export interface NyClock { weekday: string; date: string; minutes: number; tzName: string; isDst: boolean }

/** New York wall clock computed from the platform tz database, never from the API's daylight label. */
export function nyClock(at: Date): NyClock {
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return {
    weekday: parts.weekday.toUpperCase(),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
    tzName: parts.timeZoneName,
    isDst: parts.timeZoneName === "EDT",
  };
}

const DAYS: Record<string, string> = { SUN: "SUNDAY", MON: "MONDAY", TUE: "TUESDAY", WED: "WEDNESDAY", THU: "THURSDAY", FRI: "FRIDAY", SAT: "SATURDAY" };

/** Calendar closure windows are given as NY wall times "YYYY-MM-DD HH:MM". */
function inClosure(cal: Calendar, clock: NyClock): { closed: boolean; remark?: string } {
  const now = `${clock.date} ${String(Math.floor(clock.minutes / 60)).padStart(2, "0")}:${String(clock.minutes % 60).padStart(2, "0")}`;
  for (const c of cal.specificConfig) {
    if (now >= c.startTime && now < c.endTime) return { closed: true, remark: c.remark || "calendar closure" };
  }
  return { closed: false };
}

const NEXT_DAY: Record<string, string> = { SUNDAY: "MONDAY", MONDAY: "TUESDAY", TUESDAY: "WEDNESDAY", WEDNESDAY: "THURSDAY", THURSDAY: "FRIDAY", FRIDAY: "SATURDAY", SATURDAY: "SUNDAY" };

export interface SessionResult { state: SessionState; detail: string; clock: NyClock }

export function classifySession(at: Date, states: MarketStates | null, cal: Calendar | null): SessionResult {
  const clock = nyClock(at);
  if (!states || !cal || !states.stateList?.length) return { state: "unknown", detail: "market states or calendar unavailable", clock };
  const day = DAYS[clock.weekday];
  // Weekend regularConfig from the calendar is authoritative for closed days.
  const weekendDays = new Set(cal.regularConfig.map((d) => d.toUpperCase()));
  const closure = inClosure(cal, clock);
  // A US trading day runs from 20:00 NY the evening before (its overnight session) to 20:00 NY that day, the same
  // boundary Bitget's calendar closures use (a holiday on D is D-1 20:00 -> D 20:00). A closed weekday in
  // regularConfig is therefore a market-maker session from 20:00 the evening before: Friday 20:00 -> Sunday 20:00.
  const tradingDay = clock.minutes >= 20 * 60 ? NEXT_DAY[day] : day;
  if (closure.closed) return { state: "holiday_mm", detail: `Bitget calendar closure (${closure.remark}); weekend/holiday market-maker session`, clock };
  if (weekendDays.has(tradingDay)) return { state: "weekend_mm", detail: "US exchanges closed; Bitget on-platform matching + market-maker liquidity", clock };
  for (const s of states.stateList) {
    const [sh, sm] = s.startTime.split(":").map(Number); const [eh, em] = s.endTime.split(":").map(Number);
    const start = sh * 60 + sm, end = eh * 60 + em;
    const hit = start < end ? clock.minutes >= start && clock.minutes < end : clock.minutes >= start || clock.minutes < end;
    if (hit) {
      const st = s.state as SessionState;
      return { state: st, detail: `US ${st} session (${s.startTime}-${s.endTime} NY, ${clock.tzName}); orders routed to native exchanges per Bitget Stock 2.0`, clock };
    }
  }
  return { state: "unknown", detail: "no session window matched", clock };
}

/** What changes at the end of a weekend or holiday session, the only sessions the engine prices. */
export const NEXT_SWITCH_HINT = "From 20:00 New York on the evening before the next US trading day, when its overnight session opens, Bitget routes the order to the US market, which Sounding does not price; Bitget cancels unfilled weekend limit orders at the switch.";

/**
 * NY date of the next US trading day after a weekend or holiday session (weekends and calendar closures skipped).
 * null when the calendar is unavailable: callers treat that as "no session before any deadline".
 */
export function nextSessionNy(sess: SessionResult, cal: Calendar | null): string | null {
  if (!cal) return null;
  const closedDays = new Set(cal.regularConfig.map((d) => d.toUpperCase()));
  const names = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const d = new Date(`${sess.clock.date}T00:00:00Z`);
  for (let i = 1; i <= 14; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const date = d.toISOString().slice(0, 10);
    const open = `${date} 04:00`;
    if (closedDays.has(names[d.getUTCDay()])) continue;
    if (cal.specificConfig.some((c) => open >= c.startTime && open < c.endTime)) continue;
    return date;
  }
  return null;
}
