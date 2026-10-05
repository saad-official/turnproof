import { csvEscape, toCsv } from "./csv";

describe("csvEscape", () => {
  it("leaves plain values alone", () => {
    expect(csvEscape("Smith kitchen")).toBe("Smith kitchen");
    expect(csvEscape(12.5)).toBe("12.5");
  });
  it("renders null and undefined as empty", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
  it("quotes values containing commas, quotes or newlines and doubles quotes", () => {
    expect(csvEscape("Tiles, grout")).toBe('"Tiles, grout"');
    expect(csvEscape('Said "thanks"')).toBe('"Said ""thanks"""');
    expect(csvEscape("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(csvEscape("a\r\nb")).toBe('"a\r\nb"');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvEscape("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvEscape("+1 555")).toBe("'+1 555");
    expect(csvEscape("@sum")).toBe("'@sum");
    expect(csvEscape("-cmd")).toBe("'-cmd");
  });
  it("keeps negative numbers numeric", () => {
    expect(csvEscape("-12.50")).toBe("-12.50");
    expect(csvEscape(-3)).toBe("-3");
  });
});

describe("toCsv", () => {
  it("joins escaped cells with commas and rows with CRLF", () => {
    expect(toCsv([["Date", "Note"], ["2026-10-05", "a, b"]])).toBe('Date,Note\r\n2026-10-05,"a, b"\r\n');
  });
  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});
