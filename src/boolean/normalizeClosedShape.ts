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

  validateHoleTopology(normalizedOuter, normalizedHoles);

  // Hole order has no semantic meaning. Canonicalize it so equivalent inputs
  // produce the same downstream boolean/serialization order.
  normalizedHoles.sort(compareRings);
  return {
    outer: normalizedOuter,
    holes: normalizedHoles.length > 0 ? normalizedHoles : undefined,
  };
}

function pointInRing(point: { x: number; y: number }, ring: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    const crosses = ((current.y > point.y) !== (previous.y > point.y))
      && point.x < (previous.x - current.x) * (point.y - current.y) / (previous.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointOnRingBoundary(point: { x: number; y: number }, ring: { x: number; y: number }[]): boolean {
  const tolerance = GEOMETRY_TOLERANCES.pathCleanup;
  for (let i = 0; i < ring.length; i++) {
    const start = ring[i];
    const end = ring[(i + 1) % ring.length];
    const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
    if (Math.abs(cross) > tolerance) continue;
    const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
    const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    if (dot >= -tolerance && dot <= lengthSquared + tolerance) return true;
  }
  return false;
}

function ringsCross(left: { x: number; y: number }[], right: { x: number; y: number }[]): boolean {
  const tolerance = GEOMETRY_TOLERANCES.pathCleanup;
  const segmentsCross = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    d: { x: number; y: number },
  ): boolean => {
    const determinant = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (Math.abs(determinant) <= tolerance) return false;
    const u = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / determinant;
    const v = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / determinant;
    return u > tolerance && u < 1 - tolerance && v > tolerance && v < 1 - tolerance;
  };

  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = left[(i + 1) % left.length];
    for (let j = 0; j < right.length; j++) {
      if (segmentsCross(a, b, right[j], right[(j + 1) % right.length])) return true;
    }
  }
  return false;
}

function ringCentroid(ring: { x: number; y: number }[]): { x: number; y: number } {
  return ring.reduce(
    (sum, point) => ({ x: sum.x + point.x / ring.length, y: sum.y + point.y / ring.length }),
    { x: 0, y: 0 },
  );
}

function validateHoleTopology(
  outer: { x: number; y: number }[],
  holes: { x: number; y: number }[][],
): void {
  for (let index = 0; index < holes.length; index++) {
    const hole = holes[index];
    const verticesInside = hole.every((point) => pointInRing(point, outer) || pointOnRingBoundary(point, outer));
    const centroidInside = pointInRing(ringCentroid(hole), outer);
    if (!verticesInside || !centroidInside || ringsCross(outer, hole)) {
      throw new GeometryError(
        `hole ${index} is outside or crosses the outer boundary`,
        "HOLE_OUTSIDE_BOUNDARY",
      );
    }

    for (let otherIndex = index + 1; otherIndex < holes.length; otherIndex++) {
      const other = holes[otherIndex];
      const overlaps = ringsCross(hole, other)
        || pointInRing(ringCentroid(hole), other)
        || pointInRing(ringCentroid(other), hole);
      if (overlaps) {
        throw new GeometryError(
          `hole ${index} overlaps or is nested with hole ${otherIndex}`,
          "HOLE_OVERLAP",
        );
      }
    }
  }
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

  if (obj.type === "ellipse") {
    assertFiniteNumber(obj.cx, "ellipse.cx");
    assertFiniteNumber(obj.cy, "ellipse.cy");
    assertFiniteNumber(obj.rx, "ellipse.rx");
    assertFiniteNumber(obj.ry, "ellipse.ry");
    const rotation = obj.rotation ?? 0;
    assertFiniteNumber(rotation, "ellipse.rotation");
    if (obj.rx <= GEOMETRY_TOLERANCES.intersection || obj.ry <= GEOMETRY_TOLERANCES.intersection) {
      throw new GeometryError("ellipse radii must be positive", "INVALID_CLOSED_SHAPE");
    }
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const outer = [];
    const segments = 64;
    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const localX = obj.rx * Math.cos(angle);
      const localY = obj.ry * Math.sin(angle);
      outer.push({
        x: obj.cx + localX * cos - localY * sin,
        y: obj.cy + localX * sin + localY * cos,
      });
    }
    const holes = getHoles(obj, "ellipse").map((h: any) => cleanPoints(samplePathLikeObject(h), "ellipse hole"));
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
