import { describe, it, expect } from "vitest";
import {
  computeFillet,
  computeChamfer,
  offsetPolyline,
  validateNoSelfIntersection,
  type PathSegment,
} from "../path-modifiers";

// ─────────────────────────────────────────────
// computeFillet()
// ─────────────────────────────────────────────

describe("computeFillet()", () => {
  // 90° right-angle corner at origin: coming from left, going up
  const cornerPoint = { x: 0, y: 0 };
  const prevDir = { x: 1, y: 0 }; // INTO corner from left
  const nextDir = { x: 0, y: 1 }; // OUT of corner upward

  it("produces a fillet arc for a 90° corner", () => {
    const f = computeFillet(cornerPoint, prevDir, nextDir, 5, "B");
    expect(f.p1.x).toBeCloseTo(-5);
    expect(f.p1.y).toBeCloseTo(0);
    expect(f.p2.x).toBeCloseTo(0);
    expect(f.p2.y).toBeCloseTo(5);
    expect(Math.hypot(f.p1.x - f.center.x, f.p1.y - f.center.y)).toBeCloseTo(5);
    expect(Math.hypot(f.p2.x - f.center.x, f.p2.y - f.center.y)).toBeCloseTo(5);
  });

  it("fillet center is equidistant from both tangent points (radius)", () => {
    const f = computeFillet(cornerPoint, prevDir, nextDir, 10, "C");
    const d1 = Math.hypot(f.p1.x - f.center.x, f.p1.y - f.center.y);
    const d2 = Math.hypot(f.p2.x - f.center.x, f.p2.y - f.center.y);
    expect(d1).toBeCloseTo(10);
    expect(d2).toBeCloseTo(10);
  });

  it("throws INVALID_CORNER_OPERATION for zero radius", () => {
    expect(() => computeFillet(cornerPoint, prevDir, nextDir, 0, "B")).toThrow("INVALID_CORNER_OPERATION");
  });

  it("throws INVALID_CORNER_OPERATION for negative radius", () => {
    expect(() => computeFillet(cornerPoint, prevDir, nextDir, -3, "B")).toThrow("INVALID_CORNER_OPERATION");
  });
});

// ─────────────────────────────────────────────
// computeChamfer()
// ─────────────────────────────────────────────

describe("computeChamfer()", () => {
  const corner = { x: 10, y: 0 };
  const prevDir = { x: 1, y: 0 }; // INTO corner
  const nextDir = { x: 0, y: 1 }; // OUT

  it("produces correct chamfer cut points for 90° corner", () => {
    const c = computeChamfer(corner, prevDir, nextDir, 3, "C");
    expect(c.p1.x).toBeCloseTo(7);
    expect(c.p1.y).toBeCloseTo(0);
    expect(c.p2.x).toBeCloseTo(10);
    expect(c.p2.y).toBeCloseTo(3);
  });

  it("throws INVALID_CORNER_OPERATION for zero distance", () => {
    expect(() => computeChamfer(corner, prevDir, nextDir, 0, "C")).toThrow("INVALID_CORNER_OPERATION");
  });
});

// ─────────────────────────────────────────────
// offsetPolyline()
// ─────────────────────────────────────────────

describe("offsetPolyline()", () => {
  const hLine = [{ x: 0, y: 0 }, { x: 10, y: 0 }];

  it("left offset shifts segment upward (CCW side)", () => {
    const result = offsetPolyline(hLine, 5, "left", false);
    expect(result[0].y).toBeCloseTo(5);
    expect(result[1].y).toBeCloseTo(5);
  });

  it("right offset shifts segment downward (CW side)", () => {
    const result = offsetPolyline(hLine, 5, "right", false);
    expect(result[0].y).toBeCloseTo(-5);
    expect(result[1].y).toBeCloseTo(-5);
  });

  it("preserves x extent for horizontal line", () => {
    const result = offsetPolyline(hLine, 3, "left", false);
    expect(result[0].x).toBeCloseTo(0);
    expect(result[1].x).toBeCloseTo(10);
  });

  it("L-shape offset produces correct corner junction", () => {
    const lShape = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const result = offsetPolyline(lShape, 2, "left", false);
    expect(result).toHaveLength(3);
    expect(result[1].x).toBeCloseTo(8);
    expect(result[1].y).toBeCloseTo(2);
  });

  it("zero offset returns same points", () => {
    const result = offsetPolyline(hLine, 0, "left", false);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[1]).toEqual({ x: 10, y: 0 });
  });

  it("throws INVALID_OFFSET for single point path", () => {
    expect(() => offsetPolyline([{ x: 0, y: 0 }], 5, "left", false)).toThrow("INVALID_OFFSET");
  });

  it("inside/outside: outside span is greater than inside span", () => {
    const square = [
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 10, y: 10 }, { x: 0, y: 10 }
    ];
    const inside = offsetPolyline(square, 2, "inside", true);
    const outside = offsetPolyline(square, 2, "outside", true);

    const insideSpan = Math.max(...inside.map(p => p.x)) - Math.min(...inside.map(p => p.x));
    const outsideSpan = Math.max(...outside.map(p => p.x)) - Math.min(...outside.map(p => p.x));

    expect(outsideSpan).toBeGreaterThan(10);
    expect(insideSpan).toBeLessThan(10);
  });
});

// ─────────────────────────────────────────────
// validateNoSelfIntersection()
// ─────────────────────────────────────────────

describe("validateNoSelfIntersection()", () => {
  it("square (no self-intersection) passes", () => {
    const square = [
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 10, y: 10 }, { x: 0, y: 10 },
    ];
    expect(() => validateNoSelfIntersection(square, true)).not.toThrow();
  });

  it("figure-8 (self-intersecting) throws SELF_INTERSECTING_PATH", () => {
    const fig8 = [
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 10, y: 0 }, { x: 0, y: 10 },
    ];
    expect(() => validateNoSelfIntersection(fig8, false)).toThrow("SELF_INTERSECTING_PATH");
  });

  it("bowtie shape (closed self-intersecting) throws SELF_INTERSECTING_PATH", () => {
    const bowtie = [
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 10, y: 0 }, { x: 0, y: 10 },
    ];
    expect(() => validateNoSelfIntersection(bowtie, true)).toThrow("SELF_INTERSECTING_PATH");
  });

  it("open non-intersecting path passes", () => {
    const path = [
      { x: 0, y: 0 }, { x: 5, y: 3 },
      { x: 10, y: 0 }, { x: 15, y: 3 },
    ];
    expect(() => validateNoSelfIntersection(path, false)).not.toThrow();
  });
});
