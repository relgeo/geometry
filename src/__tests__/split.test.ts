import { describe, expect, it } from "vitest";
import { splitPathLikeByPoint } from "../split";

describe("splitPathLikeByPoint()", () => {
  it("splits a line into two open path pieces", () => {
    const result = splitPathLikeByPoint(
      {
        id: "L",
        type: "line",
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 0,
      },
      { x: 4, y: 0 }
    );

    expect(result.first.segments).toHaveLength(1);
    expect(result.last.segments).toHaveLength(1);
    expect(result.first.segments?.[0]).toMatchObject({ type: "line", x1: 0, y1: 0, x2: 4, y2: 0 });
    expect(result.last.segments?.[0]).toMatchObject({ type: "line", x1: 4, y1: 0, x2: 10, y2: 0 });
  });

  it("splits an arc into two arc pieces", () => {
    const result = splitPathLikeByPoint(
      {
        id: "A",
        type: "arc",
        x1: 10,
        y1: 0,
        x2: 0,
        y2: 10,
        cx: 0,
        cy: 0,
        radius: 10,
        startAngle: 0,
        endAngle: Math.PI / 2,
        sweep: 1,
        largeArc: 0,
      },
      { x: Math.sqrt(50), y: Math.sqrt(50) },
      { tolerance: 1e-5 }
    );

    expect(result.first.segments?.[0]?.type).toBe("arc");
    expect(result.last.segments?.[0]?.type).toBe("arc");
    expect(result.splitPoint.x).toBeCloseTo(Math.sqrt(50), 5);
    expect(result.splitPoint.y).toBeCloseTo(Math.sqrt(50), 5);
  });

  it("splits a quadratic curve by explicit point on curve", () => {
    const result = splitPathLikeByPoint(
      {
        id: "Q",
        type: "quadratic",
        x1: 0,
        y1: 0,
        cpx: 10,
        cpy: 10,
        x2: 20,
        y2: 0,
      },
      { x: 10, y: 5 },
      { tolerance: 1e-5 }
    );

    expect(result.first.segments?.[0]?.type).toBe("quadratic");
    expect(result.last.segments?.[0]?.type).toBe("quadratic");
    expect(result.splitPoint.x).toBeCloseTo(10, 5);
    expect(result.splitPoint.y).toBeCloseTo(5, 5);
  });

  it("splits a cubic curve by explicit point on curve", () => {
    const result = splitPathLikeByPoint(
      {
        id: "C",
        type: "cubic",
        x1: 0,
        y1: 0,
        cp1x: 10,
        cp1y: 15,
        cp2x: 20,
        cp2y: 15,
        x2: 30,
        y2: 0,
      },
      { x: 15, y: 11.25 },
      { tolerance: 1e-4 }
    );

    expect(result.first.segments?.[0]?.type).toBe("cubic");
    expect(result.last.segments?.[0]?.type).toBe("cubic");
    expect(result.splitPoint.x).toBeCloseTo(15, 4);
    expect(result.splitPoint.y).toBeCloseTo(11.25, 4);
  });

  it("splits an open multi-segment path at an internal joint without losing either side", () => {
    const result = splitPathLikeByPoint(
      {
        id: "P",
        type: "path",
        closed: false,
        segments: [
          { type: "line", x1: 0, y1: 0, x2: 10, y2: 0 },
          { type: "line", x1: 10, y1: 0, x2: 10, y2: 10 },
        ],
      },
      { x: 10, y: 0 }
    );

    expect(result.first.segments).toHaveLength(1);
    expect(result.last.segments).toHaveLength(1);
    expect(result.first.segments?.[0]).toMatchObject({ type: "line", x1: 0, y1: 0, x2: 10, y2: 0 });
    expect(result.last.segments?.[0]).toMatchObject({ type: "line", x1: 10, y1: 0, x2: 10, y2: 10 });
  });

  it("rejects closed paths in the active boundary", () => {
    expect(() =>
      splitPathLikeByPoint(
        {
          id: "closed",
          type: "path",
          closed: true,
          segments: [
            { type: "line", x1: 0, y1: 0, x2: 10, y2: 0 },
            { type: "line", x1: 10, y1: 0, x2: 10, y2: 10 },
            { type: "line", x1: 10, y1: 10, x2: 0, y2: 10 },
            { type: "line", x1: 0, y1: 10, x2: 0, y2: 0 },
          ],
        },
        { x: 5, y: 0 }
      )
    ).toThrow("INVALID_SPLIT_TARGET");
  });

  it("rejects split exactly at the start endpoint", () => {
    expect(() =>
      splitPathLikeByPoint(
        {
          id: "L",
          type: "line",
          x1: 0,
          y1: 0,
          x2: 10,
          y2: 0,
        },
        { x: 0, y: 0 }
      )
    ).toThrow("DEGENERATE_SPLIT");
  });

  it("rejects a point that is off target", () => {
    expect(() =>
      splitPathLikeByPoint(
        {
          id: "L",
          type: "line",
          x1: 0,
          y1: 0,
          x2: 10,
          y2: 0,
        },
        { x: 4, y: 1 }
      )
    ).toThrow("SPLIT_POINT_OFF_TARGET");
  });
});
