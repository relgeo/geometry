import { describe, expect, it } from "vitest";
import {
  GEOMETRY_TOLERANCES,
  normalizeClosedShape,
  signedRingArea,
  ClipperBooleanEngine,
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

  it("rejects non-finite and non-positive closed-shape dimensions", () => {
    expect(() => normalizeClosedShape(null as any)).toThrow("INVALID_CLOSED_SHAPE");
    expect(() => normalizeClosedShape(polygon("nan", [
      { x: Number.NaN, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]))).toThrow("INVALID_CLOSED_SHAPE");
    expect(() => normalizeClosedShape({
      id: "circle",
      type: "circle",
      cx: 0,
      cy: 0,
      radius: 0,
    } as any)).toThrow("INVALID_CLOSED_SHAPE");
    expect(() => normalizeClosedShape({
      id: "ellipse",
      type: "ellipse",
      cx: 0,
      cy: 0,
      rx: 0,
      ry: 2,
    } as any)).toThrow("INVALID_CLOSED_SHAPE");
    expect(() => normalizeClosedShape({
      id: "rect",
      type: "rect",
      x: 0,
      y: 0,
      width: -1,
      height: 2,
    } as any)).toThrow("INVALID_CLOSED_SHAPE");
    expect(() => normalizeClosedShape({
      id: "polygon",
      type: "polygon",
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      holes: null,
    } as any)).toThrow("INVALID_CLOSED_SHAPE");
  });

  it("normalizes rotated ellipse boundaries and preserves ellipse holes", () => {
    const result = normalizeClosedShape({
      id: "ellipse",
      type: "ellipse",
      cx: 20,
      cy: 20,
      rx: 10,
      ry: 5,
      rotation: Math.PI / 4,
      holes: [{
        segments: [
          { type: "line", x1: 18, y1: 18, x2: 22, y2: 18 },
          { type: "line", x1: 22, y1: 18, x2: 22, y2: 22 },
          { type: "line", x1: 22, y1: 22, x2: 18, y2: 22 },
          { type: "line", x1: 18, y1: 22, x2: 18, y2: 18 },
        ],
      }],
    } as any);

    expect(result.outer).toHaveLength(64);
    expect(result.holes).toHaveLength(1);
    expect(signedRingArea(result.outer)).toBeGreaterThan(0);
    expect(signedRingArea(result.holes![0])).toBeLessThan(0);
  });

  it("canonicalizes hole order as well as ring winding", () => {
    const outer = [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
    ];
    const nearHole = [
      { x: 2, y: 2 }, { x: 2, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 2 },
    ];
    const farHole = [
      { x: 12, y: 12 }, { x: 12, y: 16 }, { x: 16, y: 16 }, { x: 16, y: 12 },
    ];
    const first = normalizeClosedShape(polygon("first", outer, [
      { segments: farHole.map((point, index) => ({
        type: "line",
        x1: point.x,
        y1: point.y,
        x2: farHole[(index + 1) % farHole.length].x,
        y2: farHole[(index + 1) % farHole.length].y,
      })) },
      { segments: nearHole.map((point, index) => ({
        type: "line",
        x1: point.x,
        y1: point.y,
        x2: nearHole[(index + 1) % nearHole.length].x,
        y2: nearHole[(index + 1) % nearHole.length].y,
      })) },
    ]));
    const second = normalizeClosedShape(polygon("second", outer, [
      { segments: nearHole.map((point, index) => ({
        type: "line",
        x1: point.x,
        y1: point.y,
        x2: nearHole[(index + 1) % nearHole.length].x,
        y2: nearHole[(index + 1) % nearHole.length].y,
      })) },
      { segments: farHole.map((point, index) => ({
        type: "line",
        x1: point.x,
        y1: point.y,
        x2: farHole[(index + 1) % farHole.length].x,
        y2: farHole[(index + 1) % farHole.length].y,
      })) },
    ]));
    expect(first).toEqual(second);
  });

  it("rejects holes outside the outer boundary at the geometry boundary", () => {
    expect(() => normalizeClosedShape(polygon("outside", [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
    ], [{ segments: [
      { type: "line", x1: 30, y1: 30, x2: 40, y2: 30 },
      { type: "line", x1: 40, y1: 30, x2: 40, y2: 40 },
      { type: "line", x1: 40, y1: 40, x2: 30, y2: 40 },
      { type: "line", x1: 30, y1: 40, x2: 30, y2: 30 },
    ] }]))).toThrow("HOLE_OUTSIDE_BOUNDARY");
  });

  it("rejects overlapping or nested holes at the geometry boundary", () => {
    const ring = (x1: number, y1: number, x2: number, y2: number) => ({ segments: [
      { type: "line", x1, y1, x2, y2: y1 },
      { type: "line", x1: x2, y1, x2, y2 },
      { type: "line", x1: x2, y1: y2, x2: x1, y2 },
      { type: "line", x1, y1: y2, x2: x1, y2: y1 },
    ] });
    expect(() => normalizeClosedShape(polygon("overlap", [
      { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 },
    ], [ring(4, 4, 16, 16), ring(12, 12, 24, 24)]))).toThrow("HOLE_OVERLAP");
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

describe("ClipperBooleanEngine() input/output contract", () => {
  const engine = new ClipperBooleanEngine();
  const left = {
    outer: [
      { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 },
    ],
  };
  const right = {
    outer: [
      { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 0 },
    ],
  };

  it("returns equivalent canonical results independent of operand winding/order", () => {
    const first = engine.intersect([left, right]);
    const second = engine.intersect([right, left]);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(signedRingArea(first[0].outer)).toBeGreaterThan(0);
  });

  it("implements union and xor with stable island ordering", () => {
    const union = engine.union([left, right]);
    expect(union).toHaveLength(1);
    expect(signedRingArea(union[0].outer)).toBeCloseTo(150);

    const xor = engine.xor([left, right]);
    expect(xor).toHaveLength(2);
    expect(xor.map((island) => island.outer[0].x)).toEqual([0, 10]);
    expect(xor.every((island) => signedRingArea(island.outer) > 0)).toBe(true);
  });

  it("preserves canonical holes through an intersect result", () => {
    const withHole = {
      outer: [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
      ],
      holes: [[
        { x: 5, y: 5 }, { x: 5, y: 15 }, { x: 15, y: 15 }, { x: 15, y: 5 },
      ]],
    };
    const result = engine.intersect([withHole, {
      outer: [
        { x: -5, y: -5 }, { x: 25, y: -5 }, { x: 25, y: 25 }, { x: -5, y: 25 },
      ],
    }]);
    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(1);
    expect(signedRingArea(result[0].holes![0])).toBeLessThan(0);
  });

  it("rejects invalid direct engine inputs with the stable package code", () => {
    expect(() => engine.intersect([null as any])).toThrow("INVALID_CLOSED_SHAPE");
    expect(() => engine.intersect([{
      outer: [{ x: Number.POSITIVE_INFINITY, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    }])).toThrow("INVALID_CLOSED_SHAPE");
  });
});
