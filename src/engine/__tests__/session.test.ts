import { describe, expect, it } from "vitest";
import { classifySession, nextSessionNy, nyClock } from "../session";
import { calendar, states } from "./helpers";

const at = (iso: string) => new Date(iso);
describe("New York clock ignores the API daylight label", () => {
  it("September is EDT although the API says standard/EST", () => {
    expect(states().daylightType).toBe("standard");
    expect(nyClock(at("2026-09-20T09:02:35.800Z")).isDst).toBe(true);
    expect(nyClock(at("2026-09-20T09:02:35.800Z")).tzName).toBe("EDT");
  });
  it("January is EST", () => expect(nyClock(at("2026-01-15T15:00:00Z")).isDst).toBe(false));
});

describe("session classification", () => {
  const c = () => ({ s: states(), cal: calendar() });
  it("Sunday 09:02 UTC -> weekend_mm", () => expect(classifySession(at("2026-09-20T09:02:35.800Z"), c().s, c().cal).state).toBe("weekend_mm"));
  it("Saturday 02:00 NY (06:00 UTC) is still Friday overnight session", () => {
    // overnight 20:00-04:00 wraps; Saturday before 04:00 NY belongs to the overnight window
    expect(classifySession(at("2026-09-19T06:00:00Z"), c().s, c().cal).state).toBe("overnight");
  });
  it("Saturday 05:00 NY -> weekend_mm", () => expect(classifySession(at("2026-09-19T09:00:00Z"), c().s, c().cal).state).toBe("weekend_mm"));
  it("Monday 10:00 NY (14:00 UTC, EDT) -> regular", () => expect(classifySession(at("2026-09-21T14:00:00Z"), c().s, c().cal).state).toBe("regular"));
  it("Monday 09:29 NY -> pre_market; 09:30 -> regular (boundary)", () => {
    expect(classifySession(at("2026-09-21T13:29:00Z"), c().s, c().cal).state).toBe("pre_market");
    expect(classifySession(at("2026-09-21T13:30:00Z"), c().s, c().cal).state).toBe("regular");
  });
  it("Labor Day closure window (Sep 6 20:00 -> Sep 7 20:00 NY) -> holiday_mm", () => {
    expect(classifySession(at("2026-09-07T15:00:00Z"), c().s, c().cal).state).toBe("holiday_mm");
    expect(classifySession(at("2026-09-08T15:00:00Z"), c().s, c().cal).state).toBe("regular");
  });
  it("DST change Sunday Nov 1 2026: 02:30 NY exists twice; classification stays weekend either way", () => {
    expect(classifySession(at("2026-11-01T05:30:00Z"), c().s, c().cal).state).toBe("weekend_mm");
    expect(classifySession(at("2026-11-01T07:30:00Z"), c().s, c().cal).state).toBe("weekend_mm");
  });
  it("missing inputs -> unknown", () => expect(classifySession(at("2026-09-20T09:00:00Z"), null, c().cal).state).toBe("unknown"));
});

describe("nextSessionNy", () => {
  const at = (iso: string) => classifySession(new Date(iso), states(), calendar());
  it("Sunday -> Monday", () => expect(nextSessionNy(at("2026-09-20T15:00:00Z"), calendar())).toBe("2026-09-21"));
  it("Labor Day weekend skips the Monday closure", () => {
    const sat = at("2026-09-05T15:00:00Z");
    expect(sat.state).toBe("weekend_mm");
    expect(nextSessionNy(sat, calendar())).toBe("2026-09-08");
  });
  it("weekday session: a boundary falls today", () => expect(nextSessionNy(at("2026-09-22T15:00:00Z"), calendar())).toBe("2026-09-22"));
  it("no calendar -> null", () => expect(nextSessionNy(at("2026-09-20T15:00:00Z"), null)).toBeNull());
});

describe("next session from the overnight session", () => {
  it("Friday 21:19 NY overnight: the next session a re-quote can use is Monday, not Friday", () => {
    const fri = classifySession(new Date("2026-10-03T01:19:55Z"), states(), calendar());
    expect(fri.clock.date).toBe("2026-10-02");
    expect(nextSessionNy(fri, calendar())).toBe("2026-10-05");
  });
  it("Wednesday 21:00 NY overnight: Thursday", () => {
    expect(nextSessionNy(classifySession(new Date("2026-09-24T01:00:00Z"), states(), calendar()), calendar())).toBe("2026-09-24");
  });
});
