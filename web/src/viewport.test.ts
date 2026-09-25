import { describe, expect, it } from "vitest";
import css from "./styles.css?raw";
import { FLOOR, LABEL_PX, mapByDefault, PAD, readableFit, READABLE_PX, reveal } from "./viewport";

const canvas = { w: 1000, h: 600 };

describe("readableFit (11)", () => {
  it("reads the label size the floor is computed from out of styles.css", () => {
    expect(/\n\.node \{[^}]*font-size: (\d+)px/.exec(css)?.[1]).toBe(String(LABEL_PX));
    expect(FLOOR * LABEL_PX).toBeCloseTo(READABLE_PX);
  });
  it("centres a scene that fits at a readable zoom, and does not blow up a small one", () => {
    const v = readableFit([{ x: 0, y: 0, w: 100, h: 40 }], canvas);
    expect(v).toEqual({ x: 500 - 50 * 1.2, y: 300 - 20 * 1.2, zoom: 1.2, whole: true });
    const wide = readableFit([{ x: 0, y: 0, w: 1000, h: 40 }], canvas);
    expect([wide.zoom, wide.whole]).toEqual([(1000 - 2 * PAD) / 1000, true]);
  });
  it("never goes below the floor: the top of the scene at the top, its first row centred", () => {
    // Three rows: a narrow top row at x 1000..1200, a wide row below it.
    const rects = [
      { x: 1000, y: 0, w: 200, h: 40 },
      ...Array.from({ length: 12 }, (_, i) => ({ x: i * 200, y: 100, w: 180, h: 40 })),
      { x: 0, y: 2000, w: 100, h: 40 },
    ];
    const v = readableFit(rects, canvas);
    expect([v.zoom, v.whole, v.y]).toEqual([FLOOR, false, PAD]);
    expect(v.x).toBeCloseTo(500 - 1100 * FLOOR); // the top row's centre in the middle
  });
  it("keeps the scene's edge at the canvas edge rather than show empty space beside it", () => {
    // The top row at the far left of a wide scene.
    const rects = [{ x: 0, y: 0, w: 100, h: 40 }, { x: 0, y: 100, w: 4000, h: 40 }, { x: 0, y: 2000, w: 100, h: 40 }];
    const v = readableFit(rects, canvas);
    expect(v.x).toBeCloseTo(PAD);
  });
  it("draws nothing for an empty scene", () => {
    expect(readableFit([], canvas)).toEqual({ x: 0, y: 0, zoom: 1, whole: true });
  });
});

describe("mapByDefault (11)", () => {
  it("shows the minimap at first only in a window 900 px wide or more", () => {
    expect([mapByDefault(1600), mapByDefault(900), mapByDefault(899), mapByDefault(390)]).toEqual([true, true, false, false]);
  });
});

describe("reveal (15)", () => {
  // canvas is 1000 × 600; at zoom 2 a layout unit is 2 px.
  const v = { x: -100, y: -50, zoom: 2 };
  it("leaves a box in view where it is", () => {
    expect(reveal(v, { x: 100, y: 50, w: 100, h: 50 }, canvas)).toBeNull(); // 100..300 × 50..150 px
  });
  it("pans just enough to show a box that grew past the canvas's right or bottom edge", () => {
    // 700..1100 × 400..700 px: 100 past the right, 100 past the bottom.
    expect(reveal(v, { x: 400, y: 225, w: 200, h: 150 }, canvas)).toEqual({ x: -200 - PAD, y: -150 - PAD, zoom: 2 });
  });
  it("keeps the box's top-left in view when all of it does not fit", () => {
    // 700..2700 px wide: its left goes to PAD, and the rest runs off the right.
    expect(reveal(v, { x: 400, y: 50, w: 1000, h: 50 }, canvas)).toEqual({ x: -100 - (700 - PAD), y: -50, zoom: 2 });
  });
  it("brings a box whose top-left is off the canvas back into view", () => {
    expect(reveal(v, { x: 20, y: 10, w: 50, h: 20 }, canvas)).toEqual({ x: -100 + (60 + PAD), y: -50 + (30 + PAD), zoom: 2 });
  });
});
