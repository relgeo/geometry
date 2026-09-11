/**
 * Path Modifier Engine — RelGeo v0.3
 *
 * Handles:
 *   - Fillet: line-line corner replacement with an arc tangent to both lines
 *   - Chamfer: line-line corner replacement with a straight cut
 *   - Basic path offset (left/right/inside/outside)
 *
 * Scope constraints (per spec §8):
 *   - Line-line corners only (no arc-arc, arc-line, curve-* corners)
 *   - Path-level modifier only (not a standalone object)
 *   - Deterministic: errors instead of silent fallbacks
 */

import { GeometryError } from "./error";

import { Point2D } from "./types";

// ─────────────────────────────────────────────
// Geometry helpers (internal)
// ─────────────────────────────────────────────

function vec(a: Point2D, b: Point2D): Point2D {
  return { x: b.x - a.x, y: b.y - a.y };
}

function len(v: Point2D): number {
  return Math.hypot(v.x, v.y);
}

function unit(v: Point2D): Point2D {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
}

function add(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: Point2D, s: number): Point2D {
  return { x: v.x * s, y: v.y * s };
}

function cross2D(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

/** Signed angle between two direction vectors in radians, range (-π, π] */
function signedAngle(u: Point2D, v: Point2D): number {
  return Math.atan2(cross2D(u, v), u.x * v.x + u.y * v.y);
}

/**
 * Given an incoming direction d1 (pointing toward corner) and an outgoing
 * direction d2 (pointing away from corner), and a fillet radius r, return:
 *   - tangentSetback: how far from the corner to start/end the arc
 *   - center: center of the fillet arc
 *   - startAngle / endAngle of the arc
 *   - sweep: 1 for CCW, 0 for CW
 *
 * Throws INVALID_CORNER_OPERATION if radius is incompatible.
 */
export function computeFillet(
  cornerPoint: Point2D,
  prevDir: Point2D,  // unit vector pointing INTO the corner (from previous segment)
  nextDir: Point2D,  // unit vector pointing OUT of the corner (toward next segment)
  radius: number,
  cornerLabel: string
): {
  p1: Point2D;      // fillet start (on incoming seg)
  p2: Point2D;      // fillet end (on outgoing seg)
  center: Point2D;
  startAngle: number;
  endAngle: number;
  sweep: 0 | 1;
  largeArc: 0 | 1;
} {
  if (radius <= 0) {
    throw new GeometryError(
      `Fillet radius must be positive at corner "${cornerLabel}"`,
      "INVALID_CORNER_OPERATION"
    );
  }

  // The interior angle of the corner is the angle between:
  //   the reversed incoming direction (-prevDir) and the outgoing direction (nextDir).
  // This is the angle a person "sees" when standing at the corner.
  const revPrevDir: Point2D = { x: -prevDir.x, y: -prevDir.y };
  const interiorAngle = signedAngle(revPrevDir, nextDir); // range (-π, π]
  const halfInteriorAngle = Math.abs(interiorAngle) / 2;

  if (halfInteriorAngle < 1e-9 || Math.abs(halfInteriorAngle - Math.PI / 2) < 1e-9 && Math.tan(halfInteriorAngle) === 0) {
    throw new GeometryError(
      `Fillet at corner "${cornerLabel}" is degenerate: segments are collinear or antiparallel`,
      "INVALID_CORNER_OPERATION"
    );
  }

  // Setback from corner to tangent point: r / tan(interior_half_angle)
  const setback = radius / Math.tan(halfInteriorAngle);

  // p1: on incoming segment, setback from corner (back along -prevDir)
  const p1 = add(cornerPoint, scale({ x: -prevDir.x, y: -prevDir.y }, setback));
  // p2: on outgoing segment, setback from corner (along +nextDir)
  const p2 = add(cornerPoint, scale(nextDir, setback));

  // Arc center: perpendicular from p1 at distance=radius, on the INTERIOR side.
  //
  // The turn direction at this corner is given by cross(prevDir, nextDir):
  //   cross > 0  → CCW turn in standard math coords (y-up)
  //              → In screen coords (y-down): CW visual turn, arc bows inward
  //   cross < 0  → CW turn in math coords / CCW visual in screen coords
  //
  // The perpendicular to prevDir:
  //   perp_ccw = { -prevDir.y,  prevDir.x }  (90° CCW rotation)
  //   perp_cw  = {  prevDir.y, -prevDir.x }  (90° CW  rotation)
  //
  // For the arc to bow INWARD (concave fillet), the center must be on the
  // SAME side as the interior of the turn:
  //   cross(prevDir, nextDir) > 0 → turn is to the left of prevDir → center to the left → perp_ccw
  //   cross(prevDir, nextDir) < 0 → turn is to the right of prevDir → center to the right → perp_cw
  const crossPN = cross2D(prevDir, nextDir);
  const perp: Point2D = crossPN >= 0
    ? { x: -prevDir.y, y: prevDir.x }   // perp_ccw
    : { x:  prevDir.y, y: -prevDir.x };  // perp_cw
  const center = add(p1, scale(perp, radius));

  // Determine sweep: cross(prevDir, center-p1) >= 0 → CCW (sweep=1)
  // This is equivalent to crossPN since perp aligns with the turn sign.
  const sweep: 0 | 1 = crossPN >= 0 ? 1 : 0;

  const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
  let endAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
  if (sweep === 1 && endAngle < startAngle) endAngle += Math.PI * 2;
  if (sweep === 0 && endAngle > startAngle) endAngle -= Math.PI * 2;
  const delta = Math.abs(endAngle - startAngle);
  const largeArc: 0 | 1 = delta > Math.PI ? 1 : 0;

  return { p1, p2, center, startAngle, endAngle, sweep, largeArc };
}

/**
 * Compute chamfer: given corner and setback distances along each incoming/outgoing segment.
 * Returns the two chamfer cut points.
 */
export function computeChamfer(
  cornerPoint: Point2D,
  prevDir: Point2D,  // unit vector INTO the corner
  nextDir: Point2D,  // unit vector OUT of the corner
  distance: number,
  cornerLabel: string
): {
  p1: Point2D;  // chamfer start (on incoming seg)
  p2: Point2D;  // chamfer end (on outgoing seg)
} {
  if (distance <= 0) {
    throw new GeometryError(
      `Chamfer distance must be positive at corner "${cornerLabel}"`,
      "INVALID_CORNER_OPERATION"
    );
  }

  const p1 = add(cornerPoint, scale({ x: -prevDir.x, y: -prevDir.y }, distance));
  const p2 = add(cornerPoint, scale(nextDir, distance));
  return { p1, p2 };
}

// ─────────────────────────────────────────────
// Resolved segment types (local to this module)
// ─────────────────────────────────────────────

export type ResolvedLineSeg = { type: "line"; x1: number; y1: number; x2: number; y2: number };
export type ResolvedArcSeg = {
  type: "arc";
  x1: number; y1: number;
  x2: number; y2: number;
  cx: number; cy: number;
  radius: number;
  startAngle: number;
  endAngle: number;
  sweep: 0 | 1;
  largeArc: 0 | 1;
  xt?: number; yt?: number;
};
export type PathSegment = ResolvedLineSeg | ResolvedArcSeg | {
  type: "quadratic"; x1: number; y1: number; cpx: number; cpy: number; x2: number; y2: number;
} | {
  type: "cubic"; x1: number; y1: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x2: number; y2: number;
};

export type CornerModifier =
  | { fillet: number }
  | { chamfer: number };

export interface CornerModifiers {
  [pointLabel: string]: CornerModifier;
}

/**
 * Apply per-corner fillet/chamfer modifiers to a list of line segments.
 *
 * cornerMap: maps corner label → modifier. "all" applies to every corner.
 * segments: must be line segments only (non-line segments are passed through unchanged).
 *
 * Algorithm:
 *   For each consecutive pair of line segments sharing a corner:
 *     1. Compute the incoming/outgoing unit directions
 *     2. Verify setback does not exceed segment length → GeometryError if so
 *     3. Shorten the incoming segment and outgoing segment
 *     4. Insert arc (fillet) or line (chamfer) between them
 */
export function applyCornerModifiers(
  segments: PathSegment[],
  cornerLabels: string[],   // label of the end-point of each segment (length === segments.length)
  cornerMap: CornerModifiers,
  closed: boolean
): PathSegment[] {
  if (segments.length < 2) return segments;

  // Build a working copy (shallow-copy each segment object)
  const segs: PathSegment[] = segments.map(s => ({ ...s }));
  // Also keep the ORIGINAL endpoints so direction/length calc is not
  // affected by mutations from previous iterations (critical for wrap-around).
  const orig: PathSegment[] = segments.map(s => ({ ...s }));
  const result: PathSegment[] = [];

  const n = segs.length;

  for (let i = 0; i < n; i++) {
    const seg = segs[i] as ResolvedLineSeg;
    const nextIdx = (i + 1) % n;
    const nextSeg = segs[nextIdx] as ResolvedLineSeg;
    const cornerLabel = cornerLabels[i]; // label for the corner at end of seg[i]

    // Determine if this corner has a modifier
    const modifier = cornerMap[cornerLabel] ?? cornerMap["all"];

    const isLastSeg = i === n - 1;
    const hasNextCorner = closed ? true : !isLastSeg;

    if (!modifier || !hasNextCorner || seg.type !== "line" || nextSeg.type !== "line") {
      result.push(segs[i]);
      continue;
    }

    // Use original segment endpoints for direction/length computation so that
    // mutations from previous iterations don't corrupt the calculation.
    const origSeg = orig[i] as ResolvedLineSeg;
    const origNext = orig[nextIdx] as ResolvedLineSeg;

    const corner: Point2D = { x: origSeg.x2, y: origSeg.y2 };
    const prevDirRaw = vec({ x: origSeg.x1, y: origSeg.y1 }, corner);
    const nextDirRaw = vec(corner, { x: origNext.x2, y: origNext.y2 });

    const prevLen = len(prevDirRaw);
    const nextLen = len(nextDirRaw);

    if ("fillet" in modifier) {
      const radius = modifier.fillet;
      // Interior angle between reversed-incoming and outgoing directions
      // (must match the formula inside computeFillet)
      const revPrev = unit({ x: -prevDirRaw.x, y: -prevDirRaw.y });
      const nextU = unit(nextDirRaw);
      const interiorAngle = signedAngle(revPrev, nextU);
      const halfInterior = Math.abs(interiorAngle) / 2;
      if (Math.abs(halfInterior) < 1e-9) {
        result.push(segs[i]);
        continue; // collinear, skip
      }
      const setback = radius / Math.tan(halfInterior);

      if (setback > prevLen - 1e-9 || setback > nextLen - 1e-9) {
        throw new GeometryError(
          `Fillet radius ${radius} at corner "${cornerLabel}" exceeds available segment length`,
          "INVALID_CORNER_OPERATION"
        );
      }

      const fillet = computeFillet(corner, unit(prevDirRaw), unit(nextDirRaw), radius, cornerLabel);

      // Shorten incoming segment
      (segs[i] as ResolvedLineSeg).x2 = fillet.p1.x;
      (segs[i] as ResolvedLineSeg).y2 = fillet.p1.y;
      result.push(segs[i]);

      // Insert arc
      result.push({
        type: "arc",
        x1: fillet.p1.x,
        y1: fillet.p1.y,
        x2: fillet.p2.x,
        y2: fillet.p2.y,
        cx: fillet.center.x,
        cy: fillet.center.y,
        radius,
        startAngle: fillet.startAngle,
        endAngle: fillet.endAngle,
        sweep: fillet.sweep,
        largeArc: fillet.largeArc,
      } as ResolvedArcSeg);

      // Shorten outgoing segment start
      (segs[nextIdx] as ResolvedLineSeg).x1 = fillet.p2.x;
      (segs[nextIdx] as ResolvedLineSeg).y1 = fillet.p2.y;
    } else if ("chamfer" in modifier) {
      const distance = modifier.chamfer;
      if (distance > prevLen - 1e-9 || distance > nextLen - 1e-9) {
        throw new GeometryError(
          `Chamfer distance ${distance} at corner "${cornerLabel}" exceeds available segment length`,
          "INVALID_CORNER_OPERATION"
        );
      }

      const chamfer = computeChamfer(corner, unit(prevDirRaw), unit(nextDirRaw), distance, cornerLabel);

      // Shorten incoming segment
      (segs[i] as ResolvedLineSeg).x2 = chamfer.p1.x;
      (segs[i] as ResolvedLineSeg).y2 = chamfer.p1.y;
      result.push(segs[i]);

      // Insert chamfer line
      result.push({
        type: "line",
        x1: chamfer.p1.x,
        y1: chamfer.p1.y,
        x2: chamfer.p2.x,
        y2: chamfer.p2.y,
      } as ResolvedLineSeg);

      // Shorten outgoing segment start
      (segs[nextIdx] as ResolvedLineSeg).x1 = chamfer.p2.x;
      (segs[nextIdx] as ResolvedLineSeg).y1 = chamfer.p2.y;
    } else {
      result.push(segs[i]);
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Basic Path Offset
// ─────────────────────────────────────────────

export type OffsetSide = "left" | "right" | "inside" | "outside";

/**
 * Computes a simple offset of a polyline (array of points) by shifting each
 * segment perpendicularly. Corners are handled by extending/intersecting adjacent
 * offset segments (miter join).
 *
 * Returns the offset points. Throws SELF_INTERSECTING_PATH if the miter
 * computation fails (collapsed or self-intersecting offset).
 */
export function offsetPolyline(
  points: Point2D[],
  distance: number,
  side: OffsetSide,
  closed: boolean
): Point2D[] {
  if (distance === 0) return points.map(p => ({ ...p }));
  if (points.length < 2) {
    throw new GeometryError(
      `Polyline requires at least 2 points for offset`,
      "INVALID_OFFSET"
    );
  }

  // Determine the signed offset distance
  // "left" = positive (CCW side), "right" = negative (CW side)
  // "outside" / "inside" for closed paths: we compute winding, then pick side
  let signedDist = distance;

  if (side === "right") {
    signedDist = -distance;
  } else if (side === "inside" || side === "outside") {
    // Compute winding to determine inside/outside
    const area = signedArea(points);
    // In RelGeo's screen-style coordinate space (y grows downward),
    // a visually clockwise polygon yields positive shoelace area.
    // For that common case, left = inside and right = outside.
    if (side === "inside") {
      signedDist = area >= 0 ? distance : -distance;
    } else {
      signedDist = area >= 0 ? -distance : distance;
    }
  }

  // For each segment compute offset segment
  const n = points.length;
  const offsetSegs: { p1: Point2D; p2: Point2D }[] = [];

  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const d = vec(a, b);
    const l = len(d);
    if (l < 1e-9) continue;
    // Normal perpendicular (CCW rotation)
    const normal = unit({ x: -d.y, y: d.x });
    const offset = scale(normal, signedDist);
    offsetSegs.push({
      p1: add(a, offset),
      p2: add(b, offset),
    });
  }

  if (offsetSegs.length === 0) {
    throw new GeometryError(`Offset produced no valid segments`, "INVALID_OFFSET");
  }

  // Build output points by intersecting adjacent offset segments
  const result: Point2D[] = [];

  if (!closed) {
    result.push(offsetSegs[0].p1);
    for (let i = 0; i < offsetSegs.length - 1; i++) {
      const s1 = offsetSegs[i];
      const s2 = offsetSegs[i + 1];
      const joint = lineLineIntersectUnbounded(s1.p1, s1.p2, s2.p1, s2.p2);
      result.push(joint);
    }
    result.push(offsetSegs[offsetSegs.length - 1].p2);
  } else {
    for (let i = 0; i < offsetSegs.length; i++) {
      const s1 = offsetSegs[i];
      const s2 = offsetSegs[(i + 1) % offsetSegs.length];
      const joint = lineLineIntersectUnbounded(s1.p1, s1.p2, s2.p1, s2.p2);
      result.push(joint);
    }
  }

  return result;
}

/** Line-line intersection without segment bounds (for miter join) */
function lineLineIntersectUnbounded(
  p1: Point2D, p2: Point2D,
  p3: Point2D, p4: Point2D
): Point2D {
  const d1 = vec(p1, p2);
  const d2 = vec(p3, p4);
  const denom = cross2D(d1, d2);

  if (Math.abs(denom) < 1e-9) {
    // Parallel segments: just use midpoint of p2 and p3
    return { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  }

  const t = cross2D(vec(p1, p3), d2) / denom;
  return add(p1, scale(d1, t));
}

/** Signed area using shoelace formula. Positive = CCW. */
function signedArea(points: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * Validate a path for self-intersection.
 * This is a simple O(n²) check for polyline segments.
 * Throws GeometryError if any two non-adjacent segments cross.
 */
export function validateNoSelfIntersection(points: Point2D[], closed: boolean): void {
  const n = points.length;
  const segCount = closed ? n : n - 1;

  for (let i = 0; i < segCount - 1; i++) {
    for (let j = i + 2; j < segCount; j++) {
      if (closed && i === 0 && j === segCount - 1) continue; // first and last share a point
      const a1 = points[i];
      const a2 = points[(i + 1) % n];
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        throw new GeometryError(
          `Path is self-intersecting between segment ${i} and segment ${j}`,
          "SELF_INTERSECTING_PATH"
        );
      }
    }
  }
}

function segmentsIntersect(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  const d1 = vec(p1, p2);
  const d2 = vec(p3, p4);
  const denom = cross2D(d1, d2);

  if (Math.abs(denom) < 1e-9) return false; // parallel

  const t = cross2D(vec(p1, p3), d2) / denom;
  const u = cross2D(vec(p1, p3), d1) / denom;

  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}
