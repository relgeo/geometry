import { describe, expect, it } from "vitest";
import {
  GEOMETRY_TOLERANCES,
  normalizeClosedShape,
  signedRingArea,
} from "..";

function polygon(id: string, points: { x: number; y: number }[], holes?: unknown[]) {
  return { id, type: "polygon", points, holes } as any;
}

describe("normalizeClosedShape()", () => {
  it("normalizes outer rings to counter-clockwise independent of input winding", () => {
    const ccw = normalizeClosedShape(polygon("ccw", [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]));
    const cw = normalizeClosedShape(polygon("cw", [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ]));

    expect(signedRingArea(ccw.outer)).toBeGreaterThan(0);
    expect(signedRingArea(cw.outer)).toBeGreaterThan(0);
    expect(cw.outer).toEqual(ccw.outer);
  });

  it("normalizes holes clockwise and removes a repeated closing point", () => {
    const result = normalizeClosedShape(polygon(
      "with-hole",
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ],
      [{
        segments: [
          { type: "line", x1: 2, y1: 2, x2: 8, y2: 2 },
          { type: "line", x1: 8, y1: 2, x2: 8, y2: 8 },
          { type: "line", x1: 8, y1: 8, x2: 2, y2: 8 },
          { type: "line", x1: 2, y1: 8, x2: 2, y2: 2 },
        ],
      }],
    ));

    expect(result.outer).toHaveLength(4);
    expect(result.holes).toHaveLength(1);
    expect(signedRingArea(result.outer)).toBeGreaterThan(0);
    expect(signedRingArea(result.holes![0])).toBeLessThan(0);
  });

  it("rejects degenerate rings with a stable package error", () => {
    expect(() => normalizeClosedShape(polygon("flat", [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]))).toThrow("INVALID_CLOSED_SHAPE");
  });

  it("reports missing clone targets with a stable package error", () => {
    expect(() => normalizeClosedShape({
      id: "clone",
      type: "clone",
      of: "missing",
      children: [],
    } as any)).toThrow("MISSING_CLONE_TARGET");
  });

  it("keeps cleanup tolerance explicit and bounded", () => {
    expect(GEOMETRY_TOLERANCES.pathCleanup).toBe(1e-7);
    expect(GEOMETRY_TOLERANCES.intersection).toBe(1e-9);
  });
});
