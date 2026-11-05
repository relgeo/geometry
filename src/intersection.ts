/**
 * Generalized Intersection Engine — RelGeo DSL 0.5 compatibility line
 *
 * Ordering contract (deterministic):
 *   Results are sorted by x ascending, then by y ascending as tiebreaker.
 *   This ensures selector indices are stable for identical inputs.
 */

import type {
  ResolvedLine,
  ResolvedCircle,
  ResolvedArc,
  ResolvedQuadratic,
  ResolvedCubic,
  ResolvedPath,
  ResolvedPolygon,
  PathResolvedSegment,
  Point2D,
} from "./types";
import { GeometryError } from "./error";
import { GEOMETRY_TOLERANCES } from "./tolerance";

/** Canonical, currently supported pair keys used by `computeIntersections`. */
export const SUPPORTED_INTERSECTION_PAIRS = [
  "line-line",
  "circle-line",
  "arc-line",
  "circle-circle",
  "arc-circle",
  "arc-arc",
  "line-path",
  "line-polygon",
  "line-rect",
  "circle-path",
  "circle-polygon",
  "circle-rect",
  "arc-path",
  "arc-polygon",
  "arc-rect",
  "path-path",
  "path-polygon",
  "path-rect",
  "polygon-polygon",
  "polygon-rect",
  "rect-rect",
] as const;

/** Selector forms accepted by `applySelector`. */
export const SUPPORTED_INTERSECTION_SELECTORS = [
  "first",
  "last",
  "index",
  "nearest",
  "farthest",
] as const;

const supportedPairSet = new Set<string>(SUPPORTED_INTERSECTION_PAIRS);
type SegmentLike =
  | LineLike
  | ArcLike
  | QuadraticLike
  | CubicLike
  | PathResolvedSegment;
type LineLike = { type: "line"; x1: number; y1: number; x2: number; y2: number };
type ArcLike = {
  type: "arc";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  sweep?: 0 | 1;
  largeArc?: 0 | 1;
};
type QuadraticLike = { type: "quadratic"; x1: number; y1: number; cpx: number; cpy: number; x2: number; y2: number };
type CubicLike = { type: "cubic"; x1: number; y1: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x2: number; y2: number };

// Internal tolerance for geometric equality. See tolerance.ts for the policy.
const TOLERANCE = GEOMETRY_TOLERANCES.intersection;
const CURVE_FLATNESS_TOLERANCE = 1e-7;
const MAX_CURVE_FLATTEN_DEPTH = 12;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new GeometryError(`${label} must be finite`, "INVALID_INTERSECTION_INPUT");
  }
}

function validateLine(line: LineLike): void {
  for (const [value, label] of [
    [line.x1, "line.x1"],
    [line.y1, "line.y1"],
    [line.x2, "line.x2"],
    [line.y2, "line.y2"],
  ] as const) {
    assertFinite(value, label);
  }
  if (Math.hypot(line.x2 - line.x1, line.y2 - line.y1) <= TOLERANCE) {
    throw new GeometryError("line has zero length", "INVALID_INTERSECTION_INPUT");
  }
}

function validateCircle(circle: ResolvedCircle): void {
  for (const [value, label] of [
    [circle.cx, "circle.cx"],
    [circle.cy, "circle.cy"],
    [circle.radius, "circle.radius"],
  ] as const) {
    assertFinite(value, label);
  }
  if (circle.radius <= TOLERANCE) {
    throw new GeometryError("circle radius must be positive", "INVALID_INTERSECTION_INPUT");
  }
}

function validateArc(arc: ArcLike, label = "arc"): void {
  for (const [value, name] of [
    [arc.x1, `${label}.x1`],
    [arc.y1, `${label}.y1`],
    [arc.x2, `${label}.x2`],
    [arc.y2, `${label}.y2`],
    [arc.cx, `${label}.cx`],
    [arc.cy, `${label}.cy`],
    [arc.radius, `${label}.radius`],
    [arc.startAngle, `${label}.startAngle`],
    [arc.endAngle, `${label}.endAngle`],
  ] as const) {
    if (value !== undefined) assertFinite(value, name);
  }
  if (arc.cx === undefined || arc.cy === undefined || arc.radius === undefined) {
    throw new GeometryError(`${label} must expose center and radius`, "INVALID_INTERSECTION_INPUT");
  }
  if (arc.radius <= TOLERANCE) {
    throw new GeometryError(`${label} radius must be positive`, "INVALID_INTERSECTION_INPUT");
  }
  const hasAngles = arc.startAngle !== undefined && arc.endAngle !== undefined;
  const hasEndpoints = arc.x1 !== undefined && arc.y1 !== undefined && arc.x2 !== undefined && arc.y2 !== undefined;
  if (!hasAngles && !hasEndpoints) {
    throw new GeometryError(`${label} must expose angles or endpoints`, "INVALID_INTERSECTION_INPUT");
  }
  if (arc.sweep !== undefined && arc.sweep !== 0 && arc.sweep !== 1) {
    throw new GeometryError(`${label}.sweep must be 0 or 1`, "INVALID_INTERSECTION_INPUT");
  }
  if (arc.largeArc !== undefined && arc.largeArc !== 0 && arc.largeArc !== 1) {
    throw new GeometryError(`${label}.largeArc must be 0 or 1`, "INVALID_INTERSECTION_INPUT");
  }
}

function eq(a: number, b: number): boolean {
  return Math.abs(a - b) < TOLERANCE;
}

function sortPoints(pts: Point2D[]): Point2D[] {
  return [...pts].sort((a, b) => (eq(a.x, b.x) ? a.y - b.y : a.x - b.x));
}

function dedupePoints(pts: Point2D[]): Point2D[] {
  const sorted = sortPoints(pts);
  const result: Point2D[] = [];
  for (const pt of sorted) {
    const prev = result[result.length - 1];
    if (!prev || !eq(prev.x, pt.x) || !eq(prev.y, pt.y)) {
      result.push(pt);
    }
  }
  return result;
}

function validateSegmentLike(segment: SegmentLike, label: string): void {
  if (!segment || typeof segment !== "object") {
    throw new GeometryError(`${label} is not a segment`, "INVALID_INTERSECTION_INPUT");
  }
  if (segment.type === "line") {
    validateLine(segment);
    return;
  }
  if (segment.type === "arc") {
    validateArc(segment, label);
    return;
  }
  const values = segment.type === "quadratic"
    ? [segment.x1, segment.y1, segment.cpx, segment.cpy, segment.x2, segment.y2]
    : [segment.x1, segment.y1, segment.cp1x, segment.cp1y, segment.cp2x, segment.cp2y, segment.x2, segment.y2];
  values.forEach((value, index) => assertFinite(value, `${label}[${index}]`));
  if (Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) <= TOLERANCE) {
    throw new GeometryError(`${label} has zero-length endpoints`, "INVALID_INTERSECTION_INPUT");
  }
}

function validatePathLikeObject(obj: any, label: string): void {
  if (obj.type === "rect") {
    for (const [value, name] of [
      [obj.x, `${label}.x`], [obj.y, `${label}.y`],
      [obj.width, `${label}.width`], [obj.height, `${label}.height`],
    ] as const) assertFinite(value, name);
    if (obj.width <= TOLERANCE || obj.height <= TOLERANCE) {
      throw new GeometryError(`${label} width and height must be positive`, "INVALID_INTERSECTION_INPUT");
    }
    return;
  }

  const segments = Array.isArray(obj.segments) && obj.segments.length > 0 ? obj.segments : undefined;
  const points = Array.isArray(obj.points) ? obj.points : undefined;
  if (!segments && !points) {
    throw new GeometryError(`${label} must expose segments or points`, "INVALID_INTERSECTION_INPUT");
  }
  if (segments) {
    if (segments.length === 0) {
      throw new GeometryError(`${label} must expose at least one segment`, "INVALID_INTERSECTION_INPUT");
    }
    segments.forEach((segment: SegmentLike, index: number) => validateSegmentLike(segment, `${label}.segments[${index}]`));
  } else if (!points || points.length < (obj.type === "polygon" ? 3 : 2)) {
    throw new GeometryError(`${label} does not expose enough points`, "INVALID_INTERSECTION_INPUT");
  } else {
    points.forEach((point: Point2D, index: number) => {
      assertFinite(point.x, `${label}.points[${index}].x`);
      assertFinite(point.y, `${label}.points[${index}].y`);
    });
  }
}

// ─────────────────────────────────────────────
// Line-Line
// ─────────────────────────────────────────────

export function intersectLines(
  l1: LineLike,
  l2: LineLike
): Point2D | null {
  validateLine(l1);
  validateLine(l2);
  const { x1, y1, x2, y2 } = l1;
  const { x1: x3, y1: y3, x2: x4, y2: y4 } = l2;

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (eq(denom, 0)) return null; // parallel or coincident

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1) };
}

function pointOnSegment(p: Point2D, a: Point2D, b: Point2D): boolean {
  const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > TOLERANCE) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  if (dot < -TOLERANCE) return false;
  const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= lenSq + TOLERANCE;
}

function intersectLineWithBoundedLine(
  line: LineLike,
  segment: LineLike
): Point2D[] {
  const point = intersectLines(line, segment);
  if (!point) return [];
  return pointOnSegment(point, { x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 })
    ? [point]
    : [];
}

function intersectBoundedLines(
  l1: LineLike,
  l2: LineLike
): Point2D[] {
  const point = intersectLines(l1, l2);
  if (!point) return [];
  return pointOnSegment(point, { x: l1.x1, y: l1.y1 }, { x: l1.x2, y: l1.y2 }) &&
    pointOnSegment(point, { x: l2.x1, y: l2.y1 }, { x: l2.x2, y: l2.y2 })
    ? [point]
    : [];
}

// ─────────────────────────────────────────────
// Line-Circle
// ─────────────────────────────────────────────

export function intersectLineCircle(
  line: LineLike,
  circle: ResolvedCircle
): Point2D[] {
  validateLine(line);
  validateCircle(circle);
  const { x1, y1, x2, y2 } = line;
  const { cx, cy, radius: r } = circle;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;

  const discriminant = b * b - 4 * a * c;

  if (discriminant < -TOLERANCE) return [];
  if (eq(discriminant, 0)) {
    const t = -b / (2 * a);
    return sortPoints([{ x: x1 + t * dx, y: y1 + t * dy }]);
  }

  const sqrtD = Math.sqrt(Math.max(0, discriminant));
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  return sortPoints([
    { x: x1 + t1 * dx, y: y1 + t1 * dy },
    { x: x1 + t2 * dx, y: y1 + t2 * dy },
  ]);
}

// ─────────────────────────────────────────────
// Circle-Circle
// ─────────────────────────────────────────────

export function intersectCircles(
  c1: ResolvedCircle,
  c2: ResolvedCircle
): Point2D[] {
  validateCircle(c1);
  validateCircle(c2);
  const dx = c2.cx - c1.cx;
  const dy = c2.cy - c1.cy;
  const d = Math.hypot(dx, dy);

  if (d < TOLERANCE) return []; // concentric
  if (d > c1.radius + c2.radius + TOLERANCE) return []; // too far apart
  if (d < Math.abs(c1.radius - c2.radius) - TOLERANCE) return []; // one inside other

  const a = (c1.radius * c1.radius - c2.radius * c2.radius + d * d) / (2 * d);
  const h2 = c1.radius * c1.radius - a * a;
  if (h2 < 0) return [];
  const h = Math.sqrt(Math.max(0, h2));

  const mx = c1.cx + (a * dx) / d;
  const my = c1.cy + (a * dy) / d;

  if (eq(h, 0)) {
    return sortPoints([{ x: mx, y: my }]);
  }

  return sortPoints([
    { x: mx + (h * dy) / d, y: my - (h * dx) / d },
    { x: mx - (h * dy) / d, y: my + (h * dx) / d },
  ]);
}

// ─────────────────────────────────────────────
// Arc helpers
// ─────────────────────────────────────────────

function arcHasCx(arc: ArcLike): arc is ArcLike & {
  cx: number;
  cy: number;
  radius: number;
  startAngle: number;
  endAngle: number;
} {
  return (
    arc.cx !== undefined &&
    arc.cy !== undefined &&
    arc.radius !== undefined &&
    arc.startAngle !== undefined &&
    arc.endAngle !== undefined
  );
}

function angleInArc(angle: number, startAngle: number, endAngle: number): boolean {
  // Normalize angle to [0, 2π)
  const TAU = Math.PI * 2;
  const norm = ((angle % TAU) + TAU) % TAU;
  const s = ((startAngle % TAU) + TAU) % TAU;
  let e = ((endAngle % TAU) + TAU) % TAU;

  if (s <= e) {
    return norm >= s - TOLERANCE && norm <= e + TOLERANCE;
  } else {
    // Arc wraps around 0
    return norm >= s - TOLERANCE || norm <= e + TOLERANCE;
  }
}

function filterByArc(points: Point2D[], arc: ArcLike & { cx: number; cy: number; startAngle: number; endAngle: number }): Point2D[] {
  return points.filter((p) => {
    const angle = Math.atan2(p.y - arc.cy, p.x - arc.cx);
    return angleInArc(angle, arc.startAngle, arc.endAngle);
  });
}

function arcStartAngle(arc: Pick<ArcLike, "x1" | "y1" | "cx" | "cy">): number {
  return Math.atan2((arc.y1 ?? 0) - (arc.cy ?? 0), (arc.x1 ?? 0) - (arc.cx ?? 0));
}

function arcEndAngle(arc: Pick<ArcLike, "x2" | "y2" | "cx" | "cy">): number {
  return Math.atan2((arc.y2 ?? 0) - (arc.cy ?? 0), (arc.x2 ?? 0) - (arc.cx ?? 0));
}

function toAnalyticArc(arc: ArcLike): ArcLike | null {
  if (
    arc.cx === undefined ||
    arc.cy === undefined ||
    arc.radius === undefined ||
    ((arc.startAngle === undefined || arc.endAngle === undefined) &&
      (arc.x1 === undefined ||
        arc.y1 === undefined ||
        arc.x2 === undefined ||
        arc.y2 === undefined))
  ) {
    return null;
  }

  let startAngle = arc.startAngle ?? arcStartAngle(arc);
  let endAngle = arc.endAngle ?? arcEndAngle(arc);
  if (arc.sweep === 1 && endAngle < startAngle) endAngle += Math.PI * 2;
  if (arc.sweep === 0 && endAngle > startAngle) endAngle -= Math.PI * 2;
  return { ...arc, startAngle, endAngle };
}

// ─────────────────────────────────────────────
// Line-Arc
// ─────────────────────────────────────────────

export function intersectLineArc(
  line: LineLike,
  arc: ArcLike
): Point2D[] {
  validateLine(line);
  validateArc(arc);
  const analyticArc = toAnalyticArc(arc);
  if (!analyticArc || !arcHasCx(analyticArc)) {
    throw new GeometryError("arc cannot be converted to analytic form", "INVALID_INTERSECTION_INPUT");
  }
  const circle: ResolvedCircle = {
    id: "",
    type: "circle",
    cx: analyticArc.cx,
    cy: analyticArc.cy,
    radius: analyticArc.radius!,
  };
  const all = intersectLineCircle(line, circle);
  return sortPoints(filterByArc(all, analyticArc));
}

// ─────────────────────────────────────────────
// Circle-Arc
// ─────────────────────────────────────────────

export function intersectCircleArc(
  circle: ResolvedCircle,
  arc: ArcLike
): Point2D[] {
  validateCircle(circle);
  validateArc(arc);
  const analyticArc = toAnalyticArc(arc);
  if (!analyticArc || !arcHasCx(analyticArc)) {
    throw new GeometryError("arc cannot be converted to analytic form", "INVALID_INTERSECTION_INPUT");
  }
  const arcCircle: ResolvedCircle = {
    id: "",
    type: "circle",
    cx: analyticArc.cx,
    cy: analyticArc.cy,
    radius: analyticArc.radius!,
  };
  const all = intersectCircles(circle, arcCircle);
  return sortPoints(filterByArc(all, analyticArc));
}

// ─────────────────────────────────────────────
// Arc-Arc
// ─────────────────────────────────────────────

export function intersectArcs(
  a1: ArcLike,
  a2: ArcLike
): Point2D[] {
  validateArc(a1, "arc1");
  validateArc(a2, "arc2");
  const arc1 = toAnalyticArc(a1);
  const arc2 = toAnalyticArc(a2);
  if (!arc1 || !arc2 || !arcHasCx(arc1) || !arcHasCx(arc2)) {
    throw new GeometryError("arc cannot be converted to analytic form", "INVALID_INTERSECTION_INPUT");
  }

  const c1: ResolvedCircle = { id: "", type: "circle", cx: arc1.cx, cy: arc1.cy, radius: arc1.radius! };
  const c2: ResolvedCircle = { id: "", type: "circle", cx: arc2.cx, cy: arc2.cy, radius: arc2.radius! };
  const all = intersectCircles(c1, c2);

  const inA1 = filterByArc(all, arc1);
  const inA2 = filterByArc(inA1, arc2);
  return sortPoints(inA2);
}

function pointOnQuadratic(
  p0: Point2D,
  cp: Point2D,
  p1: Point2D,
  t: number
): Point2D {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y,
  };
}

function pointOnCubic(
  p0: Point2D,
  cp1: Point2D,
  cp2: Point2D,
  p1: Point2D,
  t: number
): Point2D {
  const mt = 1 - t;
  return {
    x:
      mt * mt * mt * p0.x +
      3 * mt * mt * t * cp1.x +
      3 * mt * t * t * cp2.x +
      t * t * t * p1.x,
    y:
      mt * mt * mt * p0.y +
      3 * mt * mt * t * cp1.y +
      3 * mt * t * t * cp2.y +
      t * t * t * p1.y,
  };
}

function sampleArc(arc: ArcLike, steps = 48): Point2D[] {
  const analyticArc = toAnalyticArc(arc);
  if (!analyticArc || analyticArc.cx === undefined || analyticArc.cy === undefined || analyticArc.radius === undefined || analyticArc.startAngle === undefined || analyticArc.endAngle === undefined) {
    return [];
  }
  const points: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = analyticArc.startAngle + (analyticArc.endAngle - analyticArc.startAngle) * t;
    points.push({
      x: analyticArc.cx + analyticArc.radius * Math.cos(angle),
      y: analyticArc.cy + analyticArc.radius * Math.sin(angle),
    });
  }
  return points;
}

function sampleQuadratic(curve: QuadraticLike, steps = 48): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    points.push(
      pointOnQuadratic(
        { x: curve.x1, y: curve.y1 },
        { x: curve.cpx, y: curve.cpy },
        { x: curve.x2, y: curve.y2 },
        i / steps
      )
    );
  }
  return points;
}

function sampleCubic(curve: CubicLike, steps = 64): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    points.push(
      pointOnCubic(
        { x: curve.x1, y: curve.y1 },
        { x: curve.cp1x, y: curve.cp1y },
        { x: curve.cp2x, y: curve.cp2y },
        { x: curve.x2, y: curve.y2 },
        i / steps
      )
    );
  }
  return points;
}

function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointLineDistance(point: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= TOLERANCE) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / length;
}

function flattenQuadratic(curve: QuadraticLike): Point2D[] {
  const result: Point2D[] = [{ x: curve.x1, y: curve.y1 }];

  const visit = (p0: Point2D, control: Point2D, p1: Point2D, depth: number): void => {
    if (depth >= MAX_CURVE_FLATTEN_DEPTH || pointLineDistance(control, p0, p1) <= CURVE_FLATNESS_TOLERANCE) {
      result.push(p1);
      return;
    }

    const p01 = midpoint(p0, control);
    const p12 = midpoint(control, p1);
    const split = midpoint(p01, p12);
    visit(p0, p01, split, depth + 1);
    visit(split, p12, p1, depth + 1);
  };

  visit(
    { x: curve.x1, y: curve.y1 },
    { x: curve.cpx, y: curve.cpy },
    { x: curve.x2, y: curve.y2 },
    0,
  );
  return result;
}

function flattenCubic(curve: CubicLike): Point2D[] {
  const result: Point2D[] = [{ x: curve.x1, y: curve.y1 }];

  const visit = (
    p0: Point2D,
    cp1: Point2D,
    cp2: Point2D,
    p1: Point2D,
    depth: number,
  ): void => {
    const flatness = Math.max(
      pointLineDistance(cp1, p0, p1),
      pointLineDistance(cp2, p0, p1),
    );
    if (depth >= MAX_CURVE_FLATTEN_DEPTH || flatness <= CURVE_FLATNESS_TOLERANCE) {
      result.push(p1);
      return;
    }

    const p01 = midpoint(p0, cp1);
    const p12 = midpoint(cp1, cp2);
    const p23 = midpoint(cp2, p1);
    const p012 = midpoint(p01, p12);
    const p123 = midpoint(p12, p23);
    const split = midpoint(p012, p123);

    visit(p0, p01, p012, split, depth + 1);
    visit(split, p123, p23, p1, depth + 1);
  };

  visit(
    { x: curve.x1, y: curve.y1 },
    { x: curve.cp1x, y: curve.cp1y },
    { x: curve.cp2x, y: curve.cp2y },
    { x: curve.x2, y: curve.y2 },
    0,
  );
  return result;
}

function polylineToSegments(points: Point2D[]): LineLike[] {
  const segments: LineLike[] = [];
  for (let i = 1; i < points.length; i++) {
    segments.push({
      type: "line",
      x1: points[i - 1].x,
      y1: points[i - 1].y,
      x2: points[i].x,
      y2: points[i].y,
    });
  }
  return segments;
}

function approximateSegment(segment: SegmentLike): LineLike[] {
  if (segment.type === "line") {
    return [segment];
  }
  if (segment.type === "arc") {
    return polylineToSegments(sampleArc(segment));
  }
  if (segment.type === "quadratic") {
    return polylineToSegments(flattenQuadratic(segment));
  }
  return polylineToSegments(flattenCubic(segment));
}

function objectToPathSegments(obj: any): SegmentLike[] | null {
  if (obj.type === "rect") {
    return [
      { type: "line", x1: obj.x, y1: obj.y, x2: obj.x + obj.width, y2: obj.y },
      { type: "line", x1: obj.x + obj.width, y1: obj.y, x2: obj.x + obj.width, y2: obj.y + obj.height },
      { type: "line", x1: obj.x + obj.width, y1: obj.y + obj.height, x2: obj.x, y2: obj.y + obj.height },
      { type: "line", x1: obj.x, y1: obj.y + obj.height, x2: obj.x, y2: obj.y },
    ];
  }
  if (obj.type === "path") {
    const allSegments: SegmentLike[] = [];
    if (Array.isArray(obj.segments) && obj.segments.length > 0) {
      allSegments.push(...(obj.segments as SegmentLike[]));
    } else if (Array.isArray(obj.points) && obj.points.length > 1) {
      for (let i = 1; i < obj.points.length; i++) {
        allSegments.push({
          type: "line",
          x1: obj.points[i - 1].x,
          y1: obj.points[i - 1].y,
          x2: obj.points[i].x,
          y2: obj.points[i].y,
        });
      }
    }

    if (Array.isArray(obj.holes)) {
      obj.holes.forEach((hole: any) => {
        if (Array.isArray(hole.segments)) {
          allSegments.push(...(hole.segments as SegmentLike[]));
        }
      });
    }
    return allSegments.length > 0 ? allSegments : null;
  }
  if (obj.type === "polygon" && Array.isArray(obj.points) && obj.points.length > 1) {
    if (Array.isArray(obj.segments) && obj.segments.length > 0) {
      return obj.segments as SegmentLike[];
    }
    const segments: LineLike[] = [];
    for (let i = 0; i < obj.points.length; i++) {
      const a = obj.points[i];
      const b = obj.points[(i + 1) % obj.points.length];
      segments.push({
        type: "line",
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
      });
    }
    return segments;
  }
  return null;
}

function intersectCircleWithSegmentLike(
  circle: ResolvedCircle,
  segment: SegmentLike
): Point2D[] {
  if (segment.type === "line") {
    return intersectLineCircle(segment, circle);
  }
  if (segment.type === "arc") {
    return intersectCircleArc(circle, segment);
  }
  const approx = approximateSegment(segment);
  return dedupePoints(
    approx.flatMap((sample) => intersectLineCircle(sample, circle))
  );
}

function intersectArcWithSegmentLike(
  arc: ArcLike,
  segment: SegmentLike
): Point2D[] {
  if (segment.type === "line") {
    return intersectLineArc(segment, arc);
  }
  if (segment.type === "arc") {
    return intersectArcs(arc, segment);
  }
  const approx = approximateSegment(segment);
  return dedupePoints(
    approx.flatMap((sample) => intersectLineArc(sample, arc))
  );
}

function intersectLineWithSegmentLike(
  line: LineLike,
  segment: SegmentLike
): Point2D[] {
  if (segment.type === "line") {
    return intersectLineWithBoundedLine(line, segment);
  }
  if (segment.type === "arc") {
    return intersectLineArc(line, segment);
  }

  const approx = approximateSegment(segment);
  return dedupePoints(
    approx.flatMap((sample) => intersectLineWithBoundedLine(line, sample))
  );
}

function intersectSegmentLikes(
  a: SegmentLike,
  b: SegmentLike
): Point2D[] {
  if (a.type === "line" && b.type === "line") {
    return intersectBoundedLines(a, b);
  }
  if (a.type === "line") {
    return intersectLineWithSegmentLike(a, b).filter((point) =>
      pointOnSegment(point, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 })
    );
  }
  if (b.type === "line") {
    return intersectLineWithSegmentLike(b, a).filter((point) =>
      pointOnSegment(point, { x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 })
    );
  }
  if (a.type === "arc" && b.type === "arc") {
    return intersectArcs(a, b);
  }

  const approxA = approximateSegment(a);
  const approxB = approximateSegment(b);
  const result: Point2D[] = [];
  for (const segA of approxA) {
    for (const segB of approxB) {
      result.push(...intersectBoundedLines(segA, segB));
    }
  }
  return dedupePoints(result);
}

function intersectLineWithPathLike(
  line: ResolvedLine,
  obj: any
): Point2D[] {
  validateLine(line);
  validatePathLikeObject(obj, `intersection.${obj.type}`);
  const segments = objectToPathSegments(obj) ?? [];
  return dedupePoints(
    segments.flatMap((segment) => intersectLineWithSegmentLike(line, segment))
  );
}

function intersectCircleWithPathLike(
  circle: ResolvedCircle,
  obj: any
): Point2D[] {
  validateCircle(circle);
  validatePathLikeObject(obj, `intersection.${obj.type}`);
  const segments = objectToPathSegments(obj) ?? [];
  return dedupePoints(
    segments.flatMap((segment) => intersectCircleWithSegmentLike(circle, segment))
  );
}

function intersectArcWithPathLike(
  arc: ArcLike,
  obj: any
): Point2D[] {
  validateArc(arc);
  validatePathLikeObject(obj, `intersection.${obj.type}`);
  const segments = objectToPathSegments(obj) ?? [];
  return dedupePoints(
    segments.flatMap((segment) => intersectArcWithSegmentLike(arc, segment))
  );
}

function intersectPathLikes(
  obj1: ResolvedPath | ResolvedPolygon,
  obj2: ResolvedPath | ResolvedPolygon
): Point2D[] {
  validatePathLikeObject(obj1, "intersection.left");
  validatePathLikeObject(obj2, "intersection.right");
  const segments1 = objectToPathSegments(obj1) ?? [];
  const segments2 = objectToPathSegments(obj2) ?? [];
  const result: Point2D[] = [];
  for (const seg1 of segments1) {
    for (const seg2 of segments2) {
      result.push(...intersectSegmentLikes(seg1, seg2));
    }
  }
  return dedupePoints(result);
}

// ─────────────────────────────────────────────
// Selector application
// ─────────────────────────────────────────────

export type IntersectionSelector =
  | "first"
  | "last"
  | { index: number }
  | { nearest: Point2D }
  | { farthest: Point2D };

export function applySelector(
  points: Point2D[],
  selector: IntersectionSelector | undefined,
  label: string
): Point2D {
  if (!Array.isArray(points)) {
    throw new GeometryError("intersection results must be an array", "INVALID_INTERSECTION_INPUT");
  }
  points.forEach((point, index) => {
    assertFinite(point.x, `${label}.points[${index}].x`);
    assertFinite(point.y, `${label}.points[${index}].y`);
  });
  if (points.length === 0) {
    throw new GeometryError(`no intersection: ${label}`, "NO_INTERSECTION");
  }

  if (selector === undefined) {
    if (points.length > 1) {
      throw new GeometryError(
        `${label} yields ${points.length} results. Use a selector.`,
        "MULTIPLE_INTERSECTIONS"
      );
    }
    return points[0];
  }

  if (selector === "first") return points[0];
  if (selector === "last") return points[points.length - 1];

  if (typeof selector === "object") {
    if ("index" in selector) {
      const idx = selector.index;
      if (!Number.isInteger(idx)) {
        throw new GeometryError(
          `intersection index must be an integer: ${idx}: ${label}`,
          "INVALID_INTERSECTION_SELECTOR"
        );
      }
      if (idx < 0 || idx >= points.length) {
        throw new GeometryError(
          `intersection index ${idx} out of range (${points.length} results): ${label}`,
          "INTERSECTION_INDEX_OUT_OF_RANGE"
        );
      }
      return points[idx];
    }
    if ("nearest" in selector) {
      const ref = selector.nearest;
      assertFinite(ref.x, `${label}.nearest.x`);
      assertFinite(ref.y, `${label}.nearest.y`);
      return points.reduce((best, p) => {
        return distSq(p, ref) < distSq(best, ref) ? p : best;
      });
    }
    if ("farthest" in selector) {
      const ref = selector.farthest;
      assertFinite(ref.x, `${label}.farthest.x`);
      assertFinite(ref.y, `${label}.farthest.y`);
      return points.reduce((best, p) => {
        return distSq(p, ref) > distSq(best, ref) ? p : best;
      });
    }
  }

  throw new GeometryError(
    `invalid intersection selector: ${JSON.stringify(selector)}`,
    "INVALID_INTERSECTION_SELECTOR"
  );
}

function distSq(a: Point2D, b: Point2D): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

// ─────────────────────────────────────────────
// Generic dispatch
// ─────────────────────────────────────────────

export function computeIntersections(obj1: any, obj2: any, label: string): Point2D[] {
  if (!obj1 || !obj2 || typeof obj1 !== "object" || typeof obj2 !== "object") {
    throw new GeometryError(`intersection operands must be objects (${label})`, "INVALID_INTERSECTION_INPUT");
  }
  const t1 = obj1.type as string;
  const t2 = obj2.type as string;
  if (typeof t1 !== "string" || typeof t2 !== "string") {
    throw new GeometryError(`intersection operands must have a type (${label})`, "INVALID_INTERSECTION_INPUT");
  }

  // Normalize order for symmetric pairs
  const pair = [t1, t2].sort().join("-");

  if (!supportedPairSet.has(pair)) {
    throw new GeometryError(
      `intersection between "${t1}" and "${t2}" is not supported by the RelGeo DSL 0.5 geometry boundary (${label})`,
      "UNSUPPORTED_FEATURE"
    );
  }

  if (t1 === "line") validateLine(obj1);
  if (t2 === "line") validateLine(obj2);
  if (t1 === "circle") validateCircle(obj1);
  if (t2 === "circle") validateCircle(obj2);
  if (t1 === "arc") validateArc(obj1, "left/right arc");
  if (t2 === "arc") validateArc(obj2, "left/right arc");
  if (t1 === "path" || t1 === "polygon" || t1 === "rect") validatePathLikeObject(obj1, "left operand");
  if (t2 === "path" || t2 === "polygon" || t2 === "rect") validatePathLikeObject(obj2, "right operand");

  switch (pair) {
    case "line-line":
      return (() => {
        const result = intersectLines(obj1, obj2);
        return result ? [result] : [];
      })();

    case "circle-line": {
      const line = t1 === "line" ? obj1 : obj2;
      const circle = t1 === "circle" ? obj1 : obj2;
      return intersectLineCircle(line, circle);
    }

    case "arc-line": {
      const line = t1 === "line" ? obj1 : obj2;
      const arc = t1 === "arc" ? obj1 : obj2;
      return intersectLineArc(line, arc);
    }

    case "circle-circle":
      return intersectCircles(obj1, obj2);

    case "arc-circle": {
      const circle = t1 === "circle" ? obj1 : obj2;
      const arc = t1 === "arc" ? obj1 : obj2;
      return intersectCircleArc(circle, arc);
    }

    case "arc-arc":
      return intersectArcs(obj1, obj2);

    case "line-path":
    case "line-polygon":
    case "line-rect": {
      const line = t1 === "line" ? obj1 : obj2;
      const pathLike = t1 === "line" ? obj2 : obj1;
      return intersectLineWithPathLike(line, pathLike);
    }

    case "circle-path":
    case "circle-polygon":
    case "circle-rect": {
      const circle = t1 === "circle" ? obj1 : obj2;
      const pathLike = t1 === "circle" ? obj2 : obj1;
      return intersectCircleWithPathLike(circle, pathLike);
    }

    case "arc-path":
    case "arc-polygon":
    case "arc-rect": {
      const arc = t1 === "arc" ? obj1 : obj2;
      const pathLike = t1 === "arc" ? obj2 : obj1;
      return intersectArcWithPathLike(arc, pathLike);
    }

    case "path-path":
    case "path-polygon":
    case "path-rect":
    case "polygon-polygon":
    case "polygon-rect":
    case "rect-rect":
      return intersectPathLikes(obj1, obj2);

    default:
      throw new GeometryError(
        `intersection between "${t1}" and "${t2}" is not supported by the RelGeo DSL 0.5 geometry boundary (${label})`,
        "UNSUPPORTED_FEATURE"
      );
  }
}
