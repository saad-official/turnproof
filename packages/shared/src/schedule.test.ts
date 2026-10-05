import { makeProperty, makeTurnover, uid } from "./fixtures.test-util";
import { countdownLabel, formatMinutes, groupByDay, isOverdue, reminderAt, turnoverWindow, upcomingTurnovers } from "./schedule";

const TZ = "America/Toronto";

describe("formatMinutes", () => {
  it("formats minutes, hours and days compactly", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(80)).toBe("1 h 20 min");
    expect(formatMinutes(24 * 60)).toBe("1 d");
    expect(formatMinutes(2 * 24 * 60 + 3 * 60 + 15)).toBe("2 d 3 h");
  });
});

describe("countdownLabel", () => {
  const now = "2026-10-06T12:00:00.000Z";
  it("counts down to a future time", () => {
    expect(countdownLabel("2026-10-06T13:20:00.000Z", now)).toBe("in 1 h 20 min");
    expect(countdownLabel("2026-10-06T12:45:00.000Z", now)).toBe("in 45 min");
  });
  it("rounds partial future minutes up", () => {
    expect(countdownLabel("2026-10-06T12:00:30.000Z", now)).toBe("in 1 min");
  });
  it("reports overdue time", () => {
    expect(countdownLabel("2026-10-06T11:45:00.000Z", now)).toBe("overdue 15 min");
    expect(countdownLabel("2026-10-06T10:55:00.000Z", now)).toBe("overdue 1 h 5 min");
  });
  it("says now within the first overdue minute", () => {
    expect(countdownLabel(now, now)).toBe("now");
    expect(countdownLabel("2026-10-06T11:59:30.000Z", now)).toBe("now");
  });
  it("uses days for long waits", () => {
    expect(countdownLabel("2026-10-08T15:00:00.000Z", now)).toBe("in 2 d 3 h");
  });
});

describe("turnoverWindow", () => {
  it("gives checkout and check-in instants on the local day", () => {
    expect(turnoverWindow(makeProperty(), "2026-10-06", TZ)).toEqual({
      checkoutAt: "2026-10-06T15:00:00.000Z",
      checkinAt: "2026-10-06T20:00:00.000Z",
    });
  });
  it("is DST-aware (winter offset after fall-back)", () => {
    expect(turnoverWindow(makeProperty(), "2026-11-02", TZ).checkoutAt).toBe("2026-11-02T16:00:00.000Z");
  });
  it("moves check-in to the next day when it is not after checkout", () => {
    const w = turnoverWindow(makeProperty({ checkoutTime: "22:00", checkinTime: "10:00" }), "2026-10-06", TZ);
    expect(w.checkinAt).toBe("2026-10-07T14:00:00.000Z");
  });
});

describe("reminderAt", () => {
  it("is the lead time before checkout on the scheduled day", () => {
    const t = makeTurnover({ scheduledFor: "2026-10-06T15:00:00.000Z" });
    expect(reminderAt(t, makeProperty(), 60, TZ)).toBe("2026-10-06T14:00:00.000Z");
  });
  it("follows the property's checkout time, not the scheduled instant", () => {
    const t = makeTurnover({ scheduledFor: "2026-10-06T17:30:00.000Z" });
    expect(reminderAt(t, makeProperty({ checkoutTime: "10:00" }), 30, TZ)).toBe("2026-10-06T13:30:00.000Z");
  });
  it("uses the local day of scheduledFor in the zone", () => {
    const t = makeTurnover({ scheduledFor: "2026-10-07T02:00:00.000Z" });
    expect(reminderAt(t, makeProperty(), 0, TZ)).toBe("2026-10-06T15:00:00.000Z");
  });
  it("subtracts real minutes across a DST change", () => {
    const t = makeTurnover({ scheduledFor: "2026-03-08T12:00:00.000Z" });
    expect(reminderAt(t, makeProperty({ checkoutTime: "03:30" }), 120, TZ)).toBe("2026-03-08T05:30:00.000Z");
  });
  it("is null for turnovers that are not scheduled or are deleted", () => {
    expect(reminderAt(makeTurnover({ status: "in-progress", startedAt: "2026-10-06T15:00:00.000Z" }), makeProperty(), 60, TZ)).toBeNull();
    expect(reminderAt(makeTurnover({ deletedAt: "2026-10-05T00:00:00.000Z" }), makeProperty(), 60, TZ)).toBeNull();
  });
});

describe("isOverdue", () => {
  it("is true for a scheduled turnover past its time", () => {
    expect(isOverdue(makeTurnover(), "2026-10-06T15:00:01.000Z")).toBe(true);
    expect(isOverdue(makeTurnover(), "2026-10-06T14:59:59.000Z")).toBe(false);
  });
  it("is false once started", () => {
    expect(isOverdue(makeTurnover({ status: "in-progress", startedAt: "2026-10-06T16:00:00.000Z" }), "2026-10-06T17:00:00.000Z")).toBe(false);
  });
});

describe("upcomingTurnovers", () => {
  const now = "2026-10-06T16:00:00.000Z"; // 12:00 in Toronto
  const at = (n: number, scheduledFor: string, extra = {}) => makeTurnover({ id: uid(n), scheduledFor, ...extra });

  it("returns scheduled turnovers from today through the next days, sorted", () => {
    const list = [
      at(3, "2026-10-08T15:00:00.000Z"),
      at(1, "2026-10-06T14:00:00.000Z"), // earlier today, overdue: still listed
      at(2, "2026-10-06T20:00:00.000Z"),
      at(4, "2026-10-13T15:00:00.000Z"), // day 8: outside a 7-day range
      at(5, "2026-10-05T15:00:00.000Z"), // yesterday
    ];
    expect(upcomingTurnovers(list, now, TZ, 7).map((t) => t.id)).toEqual([uid(1), uid(2), uid(3)]);
  });
  it("always includes running turnovers and drops closed or deleted ones", () => {
    const list = [
      at(1, "2026-10-01T15:00:00.000Z", { status: "in-progress", startedAt: "2026-10-01T15:00:00.000Z" }),
      at(2, "2026-10-06T20:00:00.000Z", { status: "finished", startedAt: "2026-10-06T15:00:00.000Z", finishedAt: "2026-10-06T16:00:00.000Z" }),
      at(3, "2026-10-06T21:00:00.000Z", { deletedAt: "2026-10-06T00:00:00.000Z" }),
    ];
    expect(upcomingTurnovers(list, now, TZ).map((t) => t.id)).toEqual([uid(1)]);
  });
  it("uses the local day boundary in the zone", () => {
    // 2026-10-07T03:30Z is still Oct 6 in Toronto; with days = 1 only today counts.
    const list = [at(1, "2026-10-07T03:30:00.000Z"), at(2, "2026-10-07T05:00:00.000Z")];
    expect(upcomingTurnovers(list, now, TZ, 1).map((t) => t.id)).toEqual([uid(1)]);
  });
});

describe("groupByDay", () => {
  it("groups by local day in order", () => {
    const list = [
      makeTurnover({ id: uid(2), scheduledFor: "2026-10-07T15:00:00.000Z" }),
      makeTurnover({ id: uid(1), scheduledFor: "2026-10-07T02:00:00.000Z" }),
      makeTurnover({ id: uid(3), scheduledFor: "2026-10-07T18:00:00.000Z" }),
    ];
    expect(groupByDay(list, TZ).map((g) => [g.dayKey, g.turnovers.map((t) => t.id)])).toEqual([
      ["2026-10-06", [uid(1)]],
      ["2026-10-07", [uid(2), uid(3)]],
    ]);
  });
  it("groups any item with a scheduledFor and keeps its extra fields", () => {
    const list = [
      { scheduledFor: "2026-10-07T15:00:00.000Z", label: "b" },
      { scheduledFor: "2026-10-07T02:00:00.000Z", label: "a" },
    ];
    const groups = groupByDay(list, TZ);
    expect(groups.map((g) => [g.dayKey, g.turnovers.map((x) => x.label)])).toEqual([
      ["2026-10-06", ["a"]],
      ["2026-10-07", ["b"]],
    ]);
  });
});
