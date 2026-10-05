import { addDaysToKey, dayKeyOf, localTime, partsToKey, tzOffsetMinutes, weekdayOfKey, zonedInstant, zonedMidnight, zonedParts } from "./tz";

describe("zonedParts", () => {
  it("returns UTC wall-clock parts by default", () => {
    expect(zonedParts("2026-10-05T23:30:15Z")).toEqual({
      year: 2026, month: 10, day: 5, hour: 23, minute: 30, second: 15, weekday: 1,
    });
  });
  it("shifts into the given zone", () => {
    expect(zonedParts("2026-10-06T02:00:00Z", "America/Toronto")).toMatchObject({
      year: 2026, month: 10, day: 5, hour: 22, weekday: 1,
    });
  });
  it("reports midnight as hour 0, not 24", () => {
    expect(zonedParts("2026-10-05T04:00:00Z", "America/Toronto").hour).toBe(0);
  });
});

describe("tzOffsetMinutes", () => {
  it("is 0 for UTC", () => {
    expect(tzOffsetMinutes("2026-01-01T00:00:00Z", "UTC")).toBe(0);
  });
  it("is -300 for Toronto in winter and -240 in summer", () => {
    expect(tzOffsetMinutes("2026-01-15T12:00:00Z", "America/Toronto")).toBe(-300);
    expect(tzOffsetMinutes("2026-07-15T12:00:00Z", "America/Toronto")).toBe(-240);
  });
  it("handles half-hour zones", () => {
    expect(tzOffsetMinutes("2026-01-15T12:00:00Z", "Asia/Kolkata")).toBe(330);
  });
});

describe("zonedMidnight", () => {
  it("returns the UTC instant of local midnight", () => {
    expect(zonedMidnight("2026-10-05", "America/Toronto")).toBe(Date.parse("2026-10-05T04:00:00Z"));
  });
  it("is correct on the spring-forward day in Toronto", () => {
    expect(zonedMidnight("2026-03-08", "America/Toronto")).toBe(Date.parse("2026-03-08T05:00:00Z"));
    expect(zonedMidnight("2026-03-09", "America/Toronto")).toBe(Date.parse("2026-03-09T04:00:00Z"));
  });
  it("defaults to UTC", () => {
    expect(zonedMidnight("2026-10-05")).toBe(Date.parse("2026-10-05T00:00:00Z"));
  });
});

describe("addDaysToKey", () => {
  it("adds and subtracts calendar days across month and year ends", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("localTime", () => {
  it("formats HH:mm in the zone", () => {
    expect(localTime("2026-10-05T13:05:00Z", "America/Toronto")).toBe("09:05");
    expect(localTime("2026-10-05T04:00:00Z", "America/Toronto")).toBe("00:00");
  });
});

describe("partsToKey", () => {
  it("zero-pads month and day", () => {
    expect(partsToKey({ year: 2026, month: 3, day: 8 })).toBe("2026-03-08");
  });
});

describe("dayKeyOf", () => {
  it("returns the local calendar day of an instant", () => {
    expect(dayKeyOf("2026-10-06T02:00:00Z", "America/Toronto")).toBe("2026-10-05");
    expect(dayKeyOf("2026-10-06T02:00:00Z")).toBe("2026-10-06");
  });
});

describe("weekdayOfKey", () => {
  it("returns 0 for Sunday through 6 for Saturday", () => {
    expect(weekdayOfKey("2026-10-04")).toBe(0);
    expect(weekdayOfKey("2026-10-05")).toBe(1);
    expect(weekdayOfKey("2026-10-10")).toBe(6);
  });
});

describe("zonedInstant", () => {
  it("converts a local wall-clock time on a day to a UTC instant", () => {
    expect(zonedInstant("2026-10-05", "08:00", "America/Toronto")).toBe(Date.parse("2026-10-05T12:00:00Z"));
    expect(zonedInstant("2026-01-15", "08:00", "America/Toronto")).toBe(Date.parse("2026-01-15T13:00:00Z"));
  });
  it("defaults to UTC", () => {
    expect(zonedInstant("2026-10-05", "20:30")).toBe(Date.parse("2026-10-05T20:30:00Z"));
  });
  it("keeps wall-clock times on the spring-forward day", () => {
    expect(zonedInstant("2026-03-08", "01:30", "America/Toronto")).toBe(Date.parse("2026-03-08T06:30:00Z"));
    expect(zonedInstant("2026-03-08", "08:00", "America/Toronto")).toBe(Date.parse("2026-03-08T12:00:00Z"));
  });
  it("shifts a time in the skipped hour forward by the gap (02:30 -> 03:30)", () => {
    const t = zonedInstant("2026-03-08", "02:30", "America/Toronto");
    expect(t).toBe(Date.parse("2026-03-08T07:30:00Z"));
    expect(localTime(t, "America/Toronto")).toBe("03:30");
  });
  it("picks the first occurrence of a repeated time on the fall-back day", () => {
    expect(zonedInstant("2026-11-01", "01:30", "America/Toronto")).toBe(Date.parse("2026-11-01T05:30:00Z"));
    expect(zonedInstant("2026-11-01", "08:00", "America/Toronto")).toBe(Date.parse("2026-11-01T13:00:00Z"));
  });
  it("handles far-east zones", () => {
    expect(zonedInstant("2026-10-05", "08:00", "Pacific/Kiritimati")).toBe(Date.parse("2026-10-04T18:00:00Z"));
  });
});
