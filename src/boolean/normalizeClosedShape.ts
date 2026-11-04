import type { ResolvedObject, PathResolvedSegment } from "../types";
import type { PolyWithHoles, Polygon2D } from "./BooleanEngine";
import { samplePathLikeObject } from "../utils";
import { applyTransformPipeline } from "../transforms";
import { GeometryError } from "../error";
import { GEOMETRY_TOLERANCES } from "../tolerance";

function assertFinitePoint(point: { x: number; y: number }, label: string): void {
  if (!point || typeof point !== "object" || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new GeometryError(`${label} contains a non-finite point`, "INVALID_CLOSED_SHAPE");
  }
}

export function cleanPoints(
  points: { x: number, y: number }[],
  label = "ring",
): { x: number, y: number }[] {
  if (!Array.isArray(points)) {
    throw new GeometryError(`${label} must be an array of points`, "INVALID_CLOSED_SHAPE");
  }
  const result: { x: number, y: number }[] = [];
  for (const [index, p] of points.entries()) {
    assertFinitePoint(p, `${label}[${index}]`);
    if (result.length === 0) {
      result.push(p);
      continue;
    }
    const last = result[result.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (Math.hypot(dx, dy) > GEOMETRY_TOLERANCES.pathCleanup) {
      result.push(p);
    }
  }
  if (result.length > 1) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < GEOMETRY_TOLERANCES.pathCleanup) {
      result.pop();
    }
  }
  return result;
}

export type RingWinding = "ccw" | "cw";

/** Signed shoelace area; positive means counter-clockwise in package coordinates. */
export function signedRingArea(points: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

export function normalizeRing(
  points: { x: number; y: number }[],
  winding: RingWinding,
  label: string
): Polygon2D {
  const cleaned = cleanPoints(points);
  const area = signedRingArea(cleaned);
  if (cleaned.length < 3 || Math.abs(area) <= GEOMETRY_TOLERANCES.intersection) {
    throw new GeometryError(`${label} must contain a non-degenerate closed ring`, "INVALID_CLOSED_SHAPE");
  }

  const wantsClockwise = winding === "cw";
  const isClockwise = area < 0;
  const oriented = wantsClockwise === isClockwise ? cleaned : [...cleaned].reverse();
  let start = 0;
  for (let i = 1; i < oriented.length; i++) {
    const candidate = oriented[i];
    const current = oriented[start];
    if (candidate.x < current.x || (candidate.x === current.x && candidate.y < current.y)) {
      start = i;
    }
  }
  return [...oriented.slice(start), ...oriented.slice(0, start)];
}

export function normalizePolyWithHoles(
  outer: { x: number; y: number }[],
  holes: { x: number; y: number }[][] = []
): PolyWithHoles {
  if (!Array.isArray(holes)) {
    throw new GeometryError("holes must be an array of rings", "INVALID_CLOSED_SHAPE");
  }
  const normalizedOuter = normalizeRing(outer, "ccw", "outer ring");
  const normalizedHoles = holes.map((hole, index) =>
    normalizeRing(hole, "cw", `hole ring ${index}`)
  );

  // Hole order has no semantic meaning. Canonicalize it so equivalent inputs
  // produce the same downstream boolean/serialization order.
  normalizedHoles.sort(compareRings);
  return {
    outer: normalizedOuter,
    holes: normalizedHoles.length > 0 ? normalizedHoles : undefined,
  };
}

function comparePoints(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x - b.x || a.y - b.y;
}

function compareRings(a: Polygon2D, b: Polygon2D): number {
  const firstA = a[0];
  const firstB = b[0];
  if (!firstA || !firstB) return a.length - b.length;
  return comparePoints(firstA, firstB) || a.length - b.length;
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new GeometryError(`${label} must be finite`, "INVALID_CLOSED_SHAPE");
  }
}

function getHoles(obj: any, label: string): any[] {
  if (obj.holes === undefined) return [];
  if (!Array.isArray(obj.holes)) {
    throw new GeometryError(`${label}.holes must be an array`, "INVALID_CLOSED_SHAPE");
  }
  return obj.holes;
}

export function normalizeClosedShape(
  obj: ResolvedObject,
  allObjects?: Record<string, ResolvedObject>
): PolyWithHoles {
  if (!obj || typeof obj !== "object" || typeof (obj as any).type !== "string") {
    throw new GeometryError("closed shape must be an object with a type", "INVALID_CLOSED_SHAPE");
  }
  if (obj.type === "rect") {
    assertFiniteNumber(obj.x, "rect.x");
    assertFiniteNumber(obj.y, "rect.y");
    assertFiniteNumber(obj.width, "rect.width");
    assertFiniteNumber(obj.height, "rect.height");
    if (obj.width <= GEOMETRY_TOLERANCES.intersection || obj.height <= GEOMETRY_TOLERANCES.intersection) {
      throw new GeometryError("rect width and height must be positive", "INVALID_CLOSED_SHAPE");
    }
    const outer = cleanPoints([
      { x: obj.x, y: obj.y },
      { x: obj.x + obj.width, y: obj.y },
      { x: obj.x + obj.width, y: obj.y + obj.height },
      { x: obj.x, y: obj.y + obj.height },
    ]);
    const holes = getHoles(obj, "rect").map((h: any) => cleanPoints(samplePathLikeObject(h), "rect hole"));
    return normalizePolyWithHoles(outer, holes);
  }
  
  if (obj.type === "circle") {
    assertFiniteNumber(obj.cx, "circle.cx");
    assertFiniteNumber(obj.cy, "circle.cy");
    assertFiniteNumber(obj.radius, "circle.radius");
    if (obj.radius <= GEOMETRY_TOLERANCES.intersection) {
      throw new GeometryError("circle radius must be positive", "INVALID_CLOSED_SHAPE");
    }
    const outer = [];
    const segments = 64;
    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      outer.push({
        x: obj.cx + obj.radius * Math.cos(angle),
        y: obj.cy + obj.radius * Math.sin(angle),
      });
    }
    const holes = getHoles(obj, "circle").map((h: any) => cleanPoints(samplePathLikeObject(h), "circle hole"));
    return normalizePolyWithHoles(outer, holes);
  }
  
  if (obj.type === "polygon") {
    const outer = cleanPoints(samplePathLikeObject(obj), "polygon outer ring");
    const holes = getHoles(obj, "polygon").map((h: any) => cleanPoints(samplePathLikeObject(h), "polygon hole"));
    return normalizePolyWithHoles(outer, holes);
  }
  
  if (obj.type === "path") {
    const outer = cleanPoints(samplePathLikeObject(obj), "path outer ring");
    const holes = getHoles(obj, "path").map((h: any) => cleanPoints(samplePathLikeObject(h), "path hole"));
    return normalizePolyWithHoles(outer, holes);
  }
  
  if (obj.type === "boolean") {
    const outer = cleanPoints(samplePathLikeObject(obj), "boolean outer ring");
    const holes = getHoles(obj, "boolean").map((h: any) => cleanPoints(samplePathLikeObject(h), "boolean hole"));
    return normalizePolyWithHoles(outer, holes);
  }

  if (obj.type === "clone") {
    const target = allObjects ? allObjects[obj.of] : undefined;
    if (!target) {
      throw new GeometryError(
        `cannot normalize clone without its target resolved object: ${obj.of}`,
        "MISSING_CLONE_TARGET"
      );
    }
    const targetNormalized = normalizeClosedShape(target, allObjects);
    const transform = obj.transform;
    if (transform && transform.length > 0) {
      const applyT = (pt: { x: number, y: number }) => applyTransformPipeline(pt, transform);
      const outer = targetNormalized.outer.map(applyT);
      const holes = targetNormalized.holes
        ? targetNormalized.holes.map(h => h.map(applyT))
        : undefined;
      return normalizePolyWithHoles(outer, holes ?? []);
    }
    return targetNormalized;
  }
  
  throw new GeometryError(
    `unsupported closed shape type: ${obj.type}`,
    "INVALID_CLOSED_SHAPE"
  );
}

export function polyToSegments(poly: Polygon2D): PathResolvedSegment[] {
  const segments: PathResolvedSegment[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    segments.push({
      type: "line",
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
    });
  }
  return segments;
}
