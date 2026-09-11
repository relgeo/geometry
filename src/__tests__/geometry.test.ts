import { describe, it, expect } from "vitest";
import {
  applyTransformPipeline,
  applyGroupTransform,
} from "../transforms";
import {
  normalizeAngle,
  isAngleOnSweep,
  sampleQuadraticPoints,
  sampleCubicPoints,
  calculateBoundingBox,
} from "../utils";

describe("Affine Transform Pipeline", () => {
  it("applies translate transform operation", () => {
    const pt = { x: 10, y: 10 };
    const transform = [{ type: "translate" as const, x: 5, y: -15 }];
    const res = applyTransformPipeline(pt, transform);
    expect(res.x).toBe(15);
    expect(res.y).toBe(-5);
  });

  it("applies rotate transform operation around origin", () => {
    const pt = { x: 10, y: 0 };
    const transform = [{
      type: "rotate" as const,
      angle: 90,
      origin: { x: 0, y: 0 }
    }];
    const res = applyTransformPipeline(pt, transform);
    expect(res.x).toBeCloseTo(0);
    expect(res.y).toBeCloseTo(10);
  });

  it("applies scale transform operation", () => {
    const pt = { x: 10, y: 10 };
    const transform = [{
      type: "scale" as const,
      factor: [2, 3] as [number, number],
      origin: { x: 0, y: 0 }
    }];
    const res = applyTransformPipeline(pt, transform);
    expect(res.x).toBe(20);
    expect(res.y).toBe(30);
  });

  it("applies mirror transform operation", () => {
    const pt = { x: 10, y: 10 };
    const transform = [{
      type: "mirror" as const,
      axis: "x" as const,
      origin: { x: 0, y: 0 }
    }];
    const res = applyTransformPipeline(pt, transform);
    expect(res.x).toBe(-10);
    expect(res.y).toBe(10);
  });
});

describe("Angle Utilities", () => {
  it("normalizes negative and large angles correctly", () => {
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((Math.PI * 3) / 2);
  });

  it("determines if target angle is on sweep range", () => {
    // 0 to 90 deg range: 45 deg is on sweep
    expect(isAngleOnSweep(0, Math.PI / 2, Math.PI / 4, 1)).toBe(true);
    // 180 deg is not on sweep
    expect(isAngleOnSweep(0, Math.PI / 2, Math.PI, 1)).toBe(false);
  });
});

describe("Curves Sampling Utilities", () => {
  it("samples quadratic bezier points", () => {
    const obj = {
      x1: 0, y1: 0,
      cpx: 10, cpy: 20,
      x2: 20, y2: 0
    };
    const pts = sampleQuadraticPoints(obj, 10);
    expect(pts).toHaveLength(11);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[10]).toEqual({ x: 20, y: 0 });
    // t=0.5: x = 10, y = 10
    expect(pts[5].x).toBeCloseTo(10);
    expect(pts[5].y).toBeCloseTo(10);
  });

  it("samples cubic bezier points", () => {
    const obj = {
      x1: 0, y1: 0,
      cp1x: 10, cp1y: 20,
      cp2x: 20, cp2y: 20,
      x2: 30, y2: 0
    };
    const pts = sampleCubicPoints(obj, 10);
    expect(pts).toHaveLength(11);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[10]).toEqual({ x: 30, y: 0 });
  });
});

describe("Calculate Bounding Box Utility", () => {
  it("calculates simple bounding box for group of shapes", () => {
    const objects = {
      pt: { type: "point", x: 10, y: 20 },
      box: { type: "rect", x: 0, y: 0, width: 50, height: 50 }
    };
    const bbox = calculateBoundingBox(objects);
    expect(bbox.x).toBe(0);
    expect(bbox.y).toBe(0);
    expect(bbox.width).toBe(50);
    expect(bbox.height).toBe(50);
  });
});
