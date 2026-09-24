import { describe, expect, it } from "vitest";
import { demotedBox, isGroup, STRIP, stripText } from "./group";
import { knownIds, scene } from "./scene";
import { DEFAULT_STATE, type ViewState } from "./state";
import { edge, pkgs, view } from "./testkit";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

// m holds two drawn boxes, a testdata box and a generated one.
const noisy = view([
  ...pkgs(["m/a", "m/b"], "m"),
  ...pkgs(["m/testdata/x", "m/testdata/y"], "m", { demoted: "name" }),
  ...pkgs(["m/gen"], "m", { demoted: "generated" }),
], [edge("m/a", "m/b"), edge("m/a", "m/testdata/x"), edge("m/b", "m/gen")]);
const at = (s: Partial<ViewState>, v = noisy) => scene(v, { ...DEFAULT_STATE, ...s }, { home: true });

describe("demotedBox (12)", () => {
  it("demotes a box when every package in it is demoted, by name before generated", () => {
    const v = view([
      ...pkgs(["m/t/a"], "m", { demoted: "name" }),
      ...pkgs(["m/t/b"], "m", { demoted: "generated" }),
      ...pkgs(["m/g"], "m", { demoted: "generated" }),
      ...pkgs(["m/mix/a"], "m", { demoted: "name" }),
      ...pkgs(["m/mix/b"], "m"),
    ]);
    expect(demotedBox(v, "m/t")).toBe("name");
    expect(demotedBox(v, "m/g")).toBe("generated");
    expect(demotedBox(v, "m/mix")).toBeUndefined();
    expect(demotedBox(v, "m")).toBeUndefined();
  });
  it("never demotes a changed package", () => {
    const v = view(pkgs(["m/gen"], "m", { demoted: "generated", status: "modified" }));
    expect(demotedBox(v, "m/gen")).toBeUndefined();
  });
});

describe("the demotion strip (12)", () => {
  it("draws demoted siblings as one strip at the bottom, used by what imports them", () => {
    const sc = at({});
    expect(sc.focus).toBe("m");
    expect(ids(sc.nodes)).toEqual([`m${STRIP}`, "m/a", "m/b"]);
    const strip = sc.nodes.find((n) => n.id === `m${STRIP}`)!;
    expect(strip.shape).toBe("chip");
    expect(strip.label).toBe("3 tests, tools & generated · used by 2");
    expect(strip.hint).toBe("2 tests & tools · 1 generated");
    expect(strip.stats).toBeUndefined();
    // One kind says itself on the line, with no tooltip.
    expect(stripText(noisy, ["m/testdata"], 3)).toEqual({ label: "2 tests & tools · used by 3" });
    expect(stripText(noisy, ["m/gen"], 0)).toEqual({ label: "1 generated · used by 0" });
    expect(strip.tier).toBe(-1);
    expect(strip.toggle).toBe("expand");
    expect(sc.against).toBe(0);
  });
  it("opens in place when toggled: its boxes in the bottom row, the strip kept to close them", () => {
    const sc = at({ toggled: [`m${STRIP}`] });
    expect(ids(sc.nodes)).toEqual([`m${STRIP}`, "m/a", "m/b", "m/gen", "m/testdata", "m/testdata/x", "m/testdata/y"]);
    for (const id of ["m/gen", "m/testdata"]) {
      const n = sc.nodes.find((x) => x.id === id)!;
      expect(n.tier).toBe(-1);
      expect(n.demoted).toBe(true);
    }
    expect(sc.nodes.find((n) => n.id === `m${STRIP}`)!.toggle).toBe("collapse");
  });
  it("keeps an opened demoted box's own toggle", () => {
    const n = at({ depth: 1, toggled: [`m${STRIP}`] }).nodes.find((x) => x.id === "m/testdata")!;
    expect([n.demoted, n.toggle]).toEqual([true, "expand"]);
  });
  it("selects the strip for a box it holds, as for a package", () => {
    expect(at({ depth: 1, selected: "m/testdata" }).selected).toBe(`m${STRIP}`);
    expect(at({ depth: 1, selected: "m/testdata/x" }).selected).toBe(`m${STRIP}`);
  });
  it("leaves a sibling set alone when all of it is demoted", () => {
    const sc = at({ focus: "m/testdata" });
    expect(ids(sc.nodes)).toEqual(["m/testdata/x", "m/testdata/y", "outside"]);
  });
  it("keeps a changed package drawn in a Change View", () => {
    const v = { ...view([...pkgs(["m/a"], "m"), ...pkgs(["m/gen"], "m", { demoted: "generated", status: "modified" })]), kind: "change" as const };
    expect(ids(at({ focus: "m" }, v).nodes)).toContain("m/gen");
  });
  it("lets a hash name a strip as a toggle", () => {
    expect(knownIds(noisy).folder(`m${STRIP}`)).toBe(true);
    expect(knownIds(noisy).folder(`nope${STRIP}`)).toBe(false);
    expect(isGroup(`m${STRIP}`)).toBe(true);
  });
});
