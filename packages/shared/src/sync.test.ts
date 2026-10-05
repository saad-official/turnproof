import { acceptPulledPhoto, applyPull, deferConflictingRunning, diffDirty, mergeRows, pickWinner, planRemoteApply, pullCursor, rowVersion } from "./sync";

type Row = { id: string; updatedAt: string; deletedAt?: string | null; v?: string };

const row = (id: string, updatedAt: string, extra: Partial<Row> = {}): Row => ({ id, updatedAt, ...extra });
const T1 = "2026-10-05T10:00:00.000Z";
const T2 = "2026-10-05T11:00:00.000Z";
const T3 = "2026-10-05T12:00:00.000Z";

describe("rowVersion", () => {
  it("is updatedAt in ms when not deleted", () => {
    expect(rowVersion(row("a", T1))).toBe(Date.parse(T1));
  });
  it("is the later of updatedAt and deletedAt", () => {
    expect(rowVersion(row("a", T1, { deletedAt: T2 }))).toBe(Date.parse(T2));
    expect(rowVersion(row("a", T2, { deletedAt: T1 }))).toBe(Date.parse(T2));
  });
});

describe("pickWinner", () => {
  it("keeps the newer row (last write wins)", () => {
    expect(pickWinner(row("a", T2, { v: "local" }), row("a", T1, { v: "remote" })).v).toBe("local");
    expect(pickWinner(row("a", T1, { v: "local" }), row("a", T2, { v: "remote" })).v).toBe("remote");
  });
  it("prefers remote on equal timestamps", () => {
    expect(pickWinner(row("a", T1, { v: "local" }), row("a", T1, { v: "remote" })).v).toBe("remote");
  });
  it("lets a newer deletedAt beat an older edit", () => {
    const local = row("a", T2, { v: "edited" });
    const remote = row("a", T1, { deletedAt: T3 });
    expect(pickWinner(local, remote).deletedAt).toBe(T3);
  });
  it("lets a newer edit beat an older delete", () => {
    const local = row("a", T1, { deletedAt: T1 });
    const remote = row("a", T2, { v: "revived" });
    expect(pickWinner(local, remote).v).toBe("revived");
  });
  it("compares instants, not strings, across offsets", () => {
    const local = row("a", "2026-10-05T07:30:00-04:00", { v: "local" }); // 11:30Z
    const remote = row("a", T2, { v: "remote" }); // 11:00Z
    expect(pickWinner(local, remote).v).toBe("local");
  });
});

describe("mergeRows", () => {
  it("unions rows by id, keeping local order and appending remote-only rows", () => {
    const merged = mergeRows([row("a", T1), row("b", T1)], [row("c", T1), row("a", T2, { v: "new" })]);
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(merged[0]?.v).toBe("new");
  });
  it("keeps soft-deleted rows (tombstones) in the output", () => {
    const merged = mergeRows([row("a", T1)], [row("a", T2, { deletedAt: T2 })]);
    expect(merged).toEqual([row("a", T2, { deletedAt: T2 })]);
  });
  it("returns empty for empty inputs", () => {
    expect(mergeRows([], [])).toEqual([]);
  });
});

describe("diffDirty", () => {
  it("returns rows changed after since", () => {
    const rows = [row("a", T1), row("b", T2), row("c", T3)];
    expect(diffDirty(rows, T2).map((r) => r.id)).toEqual(["c"]);
  });
  it("includes rows soft-deleted after since even with an old updatedAt", () => {
    expect(diffDirty([row("a", T1, { deletedAt: T3 })], T2).map((r) => r.id)).toEqual(["a"]);
  });
  it("returns every row when since is missing", () => {
    expect(diffDirty([row("a", T1), row("b", T2)], undefined)).toHaveLength(2);
    expect(diffDirty([row("a", T1)], null)).toHaveLength(1);
  });
});

describe("applyPull", () => {
  it("applies newer remote rows and reports which ids changed", () => {
    const out = applyPull([row("a", T1, { v: "old" }), row("b", T3, { v: "mine" })], [row("a", T2, { v: "theirs" }), row("b", T2), row("c", T2)]);
    expect(out.rows.map((r) => [r.id, r.v])).toEqual([
      ["a", "theirs"],
      ["b", "mine"],
      ["c", undefined],
    ]);
    expect(out.applied).toEqual(["a", "c"]);
    expect(out.kept).toEqual(["b"]);
  });
  it("does not report an identical remote row as applied", () => {
    const same = row("a", T1, { v: "x" });
    const out = applyPull([same], [{ ...same }]);
    expect(out.applied).toEqual([]);
    expect(out.kept).toEqual([]);
  });
  it("is a no-op for an empty pull", () => {
    const local = [row("a", T1)];
    expect(applyPull(local, [])).toEqual({ rows: local, applied: [], kept: [] });
  });
});

describe("pullCursor", () => {
  it("is the oldest per-table cursor", () => {
    expect(pullCursor([T2, T1, T3])).toBe(T1);
  });
  it("is undefined (full pull) when any table was never pulled", () => {
    expect(pullCursor([T2, null, T3])).toBeUndefined();
    expect(pullCursor([])).toBeUndefined();
  });
});

describe("planRemoteApply", () => {
  it("upserts only remote winners that differ from the local copy", () => {
    const plan = planRemoteApply([row("a", T1, { v: "old" }), row("b", T3), row("d", T1, { v: "same" })], [row("a", T2), row("b", T2), row("c", T2), row("d", T1, { v: "same" })]);
    expect(plan.upserts.map((r) => r.id)).toEqual(["a", "c"]);
    expect(plan.kept).toEqual(["b"]);
    expect(plan.skipped).toEqual([]);
  });
  it("skips rows the accept filter refuses", () => {
    const plan = planRemoteApply([row("a", T1)], [row("a", T2), row("new", T2)], (_remote, local) => local !== undefined);
    expect(plan.upserts.map((r) => r.id)).toEqual(["a"]);
    expect(plan.skipped).toEqual(["new"]);
  });
});

describe("acceptPulledPhoto", () => {
  it("accepts updates and tombstones for photos already on this device", () => {
    expect(acceptPulledPhoto({ remoteUrl: null }, { id: "p" })).toBe(true);
  });
  it("refuses a new photo with no uploaded copy (its file lives on another phone)", () => {
    expect(acceptPulledPhoto({ remoteUrl: null }, undefined)).toBe(false);
    expect(acceptPulledPhoto({ remoteUrl: "https://cdn.example/p.jpg" }, undefined)).toBe(true);
  });
});

describe("deferConflictingRunning", () => {
  type E = Row & { startedAt: string; endedAt?: string | null };
  const entry = (id: string, startedAt: string, endedAt: string | null, extra: Partial<E> = {}): E => ({ id, updatedAt: T3, startedAt, endedAt, ...extra });

  it("applies everything when nothing would run twice", () => {
    const out = deferConflictingRunning(null, [entry("a", T1, T2), entry("b", T2, null)]);
    expect(out.apply.map((e) => e.id)).toEqual(["a", "b"]);
    expect(out.deferred).toEqual([]);
  });
  it("defers a remote running entry while another entry runs here", () => {
    const out = deferConflictingRunning("local", [entry("a", T1, T2), entry("remote", T2, null)]);
    expect(out.apply.map((e) => e.id)).toEqual(["a"]);
    expect(out.deferred).toEqual(["remote"]);
  });
  it("applies a remote running entry once the local one is stopped by the same pull", () => {
    const out = deferConflictingRunning("local", [entry("local", T1, T2), entry("remote", T2, null)]);
    expect(out.apply.map((e) => e.id)).toEqual(["local", "remote"]);
    expect(out.deferred).toEqual([]);
  });
  it("treats an update of the local running entry as the same entry", () => {
    const out = deferConflictingRunning("local", [entry("local", T1, null, { v: "note" })]);
    expect(out.apply.map((e) => e.id)).toEqual(["local"]);
  });
  it("ignores deleted running rows and keeps only the latest of several remote running rows", () => {
    const out = deferConflictingRunning(null, [entry("old", T1, null), entry("gone", T3, null, { deletedAt: T3 }), entry("new", T2, null)]);
    expect(out.apply.map((e) => e.id)).toEqual(["gone", "new"]);
    expect(out.deferred).toEqual(["old"]);
  });
});
