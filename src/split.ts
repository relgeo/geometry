import { GeometryError } from "./error";
import {
  type PathResolvedSegment,
  type Point2D,
  type ResolvedArc,
  type ResolvedCubic,
  type ResolvedLine,
  type ResolvedPath,
  type ResolvedQuadratic,
} from "./types";
import { isAngleOnSweep } from "./utils";

export type SplitSupportedTarget =
  | ResolvedLine
  | ResolvedArc
  | ResolvedQuadratic
  | ResolvedCubic
  | ResolvedPath;

export interface SplitPathResult {
  first: ResolvedPath;
  last: ResolvedPath;
  splitPoint: Point2D;
  localT: number;
  segmentIndex: number;
}

export interface SplitOptions {
  tolerance?: number;
  curveSamples?: number;
}

type SegmentSplitCandidate = {
  distance: number;
  localT: number;
  splitPoint: Point2D;
};

const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_CURVE_SAMPLES = 64;
const SPLIT_EPS = 1e-9;

export function splitPathLikeByPoint(
  target: SplitSupportedTarget,
  point: Point2D,
  options: SplitOptions = {}
): SplitPathResult {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const curveSamples = options.curveSamples ?? DEFAULT_CURVE_SAMPLES;

  const segments = normalizeOpenSegments(target);
  if (segments.length === 0) {
    throw new GeometryError(
      "split target does not expose any open path segments",
      "INVALID_SPLIT_TARGET"
    );
  }

  let best:
    | (SegmentSplitCandidate & {
        segment: PathResolvedSegment;
        segmentIndex: number;
      })
    | undefined;

  for (let i = 0; i < segments.length; i++) {
    const candidate = findSplitCandidateOnSegment(segments[i], point, tolerance, curveSamples);
    if (!candidate) continue;
    if (!best || candidate.distance < best.distance) {
      best = {
        ...candidate,
        segment: segments[i],
        segmentIndex: i,
      };
    }
  }

  if (!best || best.distance > tolerance) {
    throw new GeometryError(
      "split point is not on the target within the active tolerance",
      "SPLIT_POINT_OFF_TARGET"
    );
  }

  const isAtGlobalStart = best.segmentIndex === 0 && best.localT <= SPLIT_EPS;
  const isAtGlobalEnd =
    best.segmentIndex === segments.length - 1 && best.localT >= 1 - SPLIT_EPS;

  if (isAtGlobalStart || isAtGlobalEnd) {
    throw new GeometryError(
      "split point cannot be exactly at the start or end of an open target",
      "DEGENERATE_SPLIT"
    );
  }

  const firstSegments: PathResolvedSegment[] = [];
  const lastSegments: PathResolvedSegment[] = [];

  for (let i = 0; i < best.segmentIndex; i++) {
    firstSegments.push(cloneSegment(segments[i]));
  }

  const currentSplit = splitSegmentAt(segments[best.segmentIndex], best.localT);
  if (currentSplit.first) firstSegments.push(currentSplit.first);
  if (currentSplit.last) lastSegments.push(currentSplit.last);

  for (let i = best.segmentIndex + 1; i < segments.length; i++) {
    lastSegments.push(cloneSegment(segments[i]));
  }

  if (firstSegments.length === 0 || lastSegments.length === 0) {
    throw new GeometryError(
      "split operation produced an empty side unexpectedly",
      "SPLIT_RESOLUTION_FAILED"
    );
  }

  return {
    first: toOpenPath(firstSegments),
    last: toOpenPath(lastSegments),
    splitPoint: best.splitPoint,
    localT: best.localT,
    segmentIndex: best.segmentIndex,
  };
}

function normalizeOpenSegments(target: SplitSupportedTarget): PathResolvedSegment[] {
  if (target.type === "line") {
    return [
      {
        type: "line",
        x1: target.x1,
        y1: target.y1,
        x2: target.x2,
        y2: target.y2,
      },
    ];
  }

  if (target.type === "arc") {
    if (
      target.x1 === undefined ||
      target.y1 === undefined ||
      target.x2 === undefined ||
      target.y2 === undefined ||
      target.cx === undefined ||
      target.cy === undefined ||
      target.radius === undefined ||
      target.sweep === undefined
    ) {
      throw new GeometryError(
        "arc target does not expose enough analytic data for split",
        "INVALID_SPLIT_TARGET"
      );
    }
    return [
      {
        type: "arc",
        x1: target.x1,
        y1: target.y1,
        x2: target.x2,
        y2: target.y2,
        cx: target.cx,
        cy: target.cy,
        radius: target.radius,
        sweep: target.sweep,
        largeArc: target.largeArc ?? 0,
        xt: target.xt,
        yt: target.yt,
      },
    ];
  }

  if (target.type === "quadratic") {
    return [
      {
        type: "quadratic",
        x1: target.x1,
        y1: target.y1,
        cpx: target.cpx,
        cpy: target.cpy,
        x2: target.x2,
        y2: target.y2,
      },
    ];
  }

  if (target.type === "cubic") {
    return [
      {
        type: "cubic",
        x1: target.x1,
        y1: target.y1,
        cp1x: target.cp1x,
        cp1y: target.cp1y,
        cp2x: target.cp2x,
        cp2y: target.cp2y,
        x2: target.x2,
        y2: target.y2,
      },
    ];
  }

  if (target.type === "path") {
    if (target.closed) {
      throw new GeometryError(
        "closed path targets are not supported by the active split boundary",
        "INVALID_SPLIT_TARGET"
      );
    }
    if (Array.isArray(target.segments) && target.segments.length > 0) {
      return target.segments.map(cloneSegment);
    }
    if (Array.isArray(target.points) && target.points.length > 1) {
      const segments: PathResolvedSegment[] = [];
      for (let i = 0; i < target.points.length - 1; i++) {
        segments.push({
          type: "line",
          x1: target.points[i].x,
          y1: target.points[i].y,
          x2: target.points[i + 1].x,
          y2: target.points[i + 1].y,
        });
      }
      return segments;
    }
  }

  throw new GeometryError(
    `target type "${target.type}" is not supported by split`,
    "INVALID_SPLIT_TARGET"
  );
}

function findSplitCandidateOnSegment(
  segment: PathResolvedSegment,
  point: Point2D,
  tolerance: number,
  curveSamples: number
): SegmentSplitCandidate | undefined {
  if (segment.type === "line") {
    return splitCandidateOnLine(segment, point, tolerance);
  }
  if (segment.type === "arc") {
    return splitCandidateOnArc(segment, point, tolerance);
  }
  if (segment.type === "quadratic") {
    return splitCandidateOnQuadratic(segment, point, tolerance, curveSamples);
  }
  return splitCandidateOnCubic(segment, point, tolerance, curveSamples);
}

function splitCandidateOnLine(
  segment: Extract<PathResolvedSegment, { type: "line" }>,
  point: Point2D,
  tolerance: number
): SegmentSplitCandidate | undefined {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    throw new GeometryError(
      "line segment has zero length and cannot be split",
      "SPLIT_RESOLUTION_FAILED"
    );
  }
  const rawT = ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / len2;
  if (rawT < -tolerance || rawT > 1 + tolerance) return undefined;
  const localT = clamp01(rawT);
  const splitPoint = lerpPoint(
    { x: segment.x1, y: segment.y1 },
    { x: segment.x2, y: segment.y2 },
    localT
  );
  const distance = distanceBetween(splitPoint, point);
  if (distance > tolerance) return undefined;
  return { distance, localT, splitPoint };
}

function splitCandidateOnArc(
  segment: Extract<PathResolvedSegment, { type: "arc" }>,
  point: Point2D,
  tolerance: number
): SegmentSplitCandidate | undefined {
  const startAngle = Math.atan2(segment.y1 - segment.cy, segment.x1 - segment.cx);
  let endAngle = Math.atan2(segment.y2 - segment.cy, segment.x2 - segment.cx);
  if (segment.sweep === 1 && endAngle < startAngle) endAngle += Math.PI * 2;
  if (segment.sweep === 0 && endAngle > startAngle) endAngle -= Math.PI * 2;

  const dx = point.x - segment.cx;
  const dy = point.y - segment.cy;
  const radiusDistance = Math.hypot(dx, dy);
  if (Math.abs(radiusDistance - segment.radius) > tolerance) return undefined;

  let angle = Math.atan2(dy, dx);
  if (!isAngleOnSweep(startAngle, endAngle, angle, segment.sweep)) {
    if (segment.sweep === 1 && angle < startAngle) angle += Math.PI * 2;
    if (segment.sweep === 0 && angle > startAngle) angle -= Math.PI * 2;
    if (!isAngleOnSweep(startAngle, endAngle, angle, segment.sweep)) return undefined;
  }

  const totalSpan = endAngle - startAngle;
  if (Math.abs(totalSpan) <= SPLIT_EPS) {
    throw new GeometryError(
      "arc segment has zero sweep and cannot be split",
      "SPLIT_RESOLUTION_FAILED"
    );
  }
  const localT = clamp01((angle - startAngle) / totalSpan);
  const splitPoint = {
    x: segment.cx + segment.radius * Math.cos(angle),
    y: segment.cy + segment.radius * Math.sin(angle),
  };
  return {
    distance: distanceBetween(splitPoint, point),
    localT,
    splitPoint,
  };
}

function splitCandidateOnQuadratic(
  segment: Extract<PathResolvedSegment, { type: "quadratic" }>,
  point: Point2D,
  tolerance: number,
  curveSamples: number
): SegmentSplitCandidate | undefined {
  return splitCandidateOnParametricCurve(
    (t) =>
      pointOnQuadratic(
        { x: segment.x1, y: segment.y1 },
        { x: segment.cpx, y: segment.cpy },
        { x: segment.x2, y: segment.y2 },
        t
      ),
    point,
    tolerance,
    curveSamples
  );
}

function splitCandidateOnCubic(
  segment: Extract<PathResolvedSegment, { type: "cubic" }>,
  point: Point2D,
  tolerance: number,
  curveSamples: number
): SegmentSplitCandidate | undefined {
  return splitCandidateOnParametricCurve(
    (t) =>
      pointOnCubic(
        { x: segment.x1, y: segment.y1 },
        { x: segment.cp1x, y: segment.cp1y },
        { x: segment.cp2x, y: segment.cp2y },
        { x: segment.x2, y: segment.y2 },
        t
      ),
    point,
    tolerance,
    curveSamples
  );
}

function splitCandidateOnParametricCurve(
  pointOnCurve: (t: number) => Point2D,
  point: Point2D,
  tolerance: number,
  curveSamples: number
): SegmentSplitCandidate | undefined {
  const coarse = Math.max(8, curveSamples);
  let bestT = 0;
  let bestPoint = pointOnCurve(0);
  let bestDistance = distanceBetween(bestPoint, point);

  for (let i = 1; i <= coarse; i++) {
    const t = i / coarse;
    const sample = pointOnCurve(t);
    const dist = distanceBetween(sample, point);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestT = t;
      bestPoint = sample;
    }
  }

  let low = Math.max(0, bestT - 1 / coarse);
  let high = Math.min(1, bestT + 1 / coarse);
  for (let i = 0; i < 18; i++) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    const leftPoint = pointOnCurve(left);
    const rightPoint = pointOnCurve(right);
    const leftDistance = distanceBetween(leftPoint, point);
    const rightDistance = distanceBetween(rightPoint, point);
    if (leftDistance <= rightDistance) {
      high = right;
      if (leftDistance < bestDistance) {
        bestDistance = leftDistance;
        bestT = left;
        bestPoint = leftPoint;
      }
    } else {
      low = left;
      if (rightDistance < bestDistance) {
        bestDistance = rightDistance;
        bestT = right;
        bestPoint = rightPoint;
      }
    }
  }

  if (bestDistance > tolerance) return undefined;
  return {
    distance: bestDistance,
    localT: clamp01(bestT),
    splitPoint: bestPoint,
  };
}

function splitSegmentAt(segment: PathResolvedSegment, t: number): {
  first: PathResolvedSegment | null;
  last: PathResolvedSegment | null;
} {
  if (t <= SPLIT_EPS) {
    return { first: null, last: cloneSegment(segment) };
  }
  if (t >= 1 - SPLIT_EPS) {
    return { first: cloneSegment(segment), last: null };
  }

  if (segment.type === "line") {
    const splitPoint = lerpPoint(
      { x: segment.x1, y: segment.y1 },
      { x: segment.x2, y: segment.y2 },
      t
    );
    return {
      first: {
        type: "line",
        x1: segment.x1,
        y1: segment.y1,
        x2: splitPoint.x,
        y2: splitPoint.y,
      },
      last: {
        type: "line",
        x1: splitPoint.x,
        y1: splitPoint.y,
        x2: segment.x2,
        y2: segment.y2,
      },
    };
  }

  if (segment.type === "arc") {
    const startAngle = Math.atan2(segment.y1 - segment.cy, segment.x1 - segment.cx);
    let endAngle = Math.atan2(segment.y2 - segment.cy, segment.x2 - segment.cx);
    if (segment.sweep === 1 && endAngle < startAngle) endAngle += Math.PI * 2;
    if (segment.sweep === 0 && endAngle > startAngle) endAngle -= Math.PI * 2;
    const splitAngle = startAngle + (endAngle - startAngle) * t;
    const splitPoint = {
      x: segment.cx + segment.radius * Math.cos(splitAngle),
      y: segment.cy + segment.radius * Math.sin(splitAngle),
    };
    const firstSpan = splitAngle - startAngle;
    const secondSpan = endAngle - splitAngle;
    return {
      first: {
        type: "arc",
        x1: segment.x1,
        y1: segment.y1,
        x2: splitPoint.x,
        y2: splitPoint.y,
        cx: segment.cx,
        cy: segment.cy,
        radius: segment.radius,
        sweep: segment.sweep,
        largeArc: Math.abs(firstSpan) > Math.PI ? 1 : 0,
      },
      last: {
        type: "arc",
        x1: splitPoint.x,
        y1: splitPoint.y,
        x2: segment.x2,
        y2: segment.y2,
        cx: segment.cx,
        cy: segment.cy,
        radius: segment.radius,
        sweep: segment.sweep,
        largeArc: Math.abs(secondSpan) > Math.PI ? 1 : 0,
      },
    };
  }

  if (segment.type === "quadratic") {
    const p0 = { x: segment.x1, y: segment.y1 };
    const p1 = { x: segment.cpx, y: segment.cpy };
    const p2 = { x: segment.x2, y: segment.y2 };
    const p01 = lerpPoint(p0, p1, t);
    const p12 = lerpPoint(p1, p2, t);
    const splitPoint = lerpPoint(p01, p12, t);
    return {
      first: {
        type: "quadratic",
        x1: p0.x,
        y1: p0.y,
        cpx: p01.x,
        cpy: p01.y,
        x2: splitPoint.x,
        y2: splitPoint.y,
      },
      last: {
        type: "quadratic",
        x1: splitPoint.x,
        y1: splitPoint.y,
        cpx: p12.x,
        cpy: p12.y,
        x2: p2.x,
        y2: p2.y,
      },
    };
  }

  const p0 = { x: segment.x1, y: segment.y1 };
  const p1 = { x: segment.cp1x, y: segment.cp1y };
  const p2 = { x: segment.cp2x, y: segment.cp2y };
  const p3 = { x: segment.x2, y: segment.y2 };
  const p01 = lerpPoint(p0, p1, t);
  const p12 = lerpPoint(p1, p2, t);
  const p23 = lerpPoint(p2, p3, t);
  const p012 = lerpPoint(p01, p12, t);
  const p123 = lerpPoint(p12, p23, t);
  const splitPoint = lerpPoint(p012, p123, t);

  return {
    first: {
      type: "cubic",
      x1: p0.x,
      y1: p0.y,
      cp1x: p01.x,
      cp1y: p01.y,
      cp2x: p012.x,
      cp2y: p012.y,
      x2: splitPoint.x,
      y2: splitPoint.y,
    },
    last: {
      type: "cubic",
      x1: splitPoint.x,
      y1: splitPoint.y,
      cp1x: p123.x,
      cp1y: p123.y,
      cp2x: p23.x,
      cp2y: p23.y,
      x2: p3.x,
      y2: p3.y,
    },
  };
}

function toOpenPath(segments: PathResolvedSegment[]): ResolvedPath {
  return {
    id: "",
    type: "path",
    segments,
    closed: false,
  };
}

function cloneSegment(segment: PathResolvedSegment): PathResolvedSegment {
  return { ...segment };
}

function pointOnQuadratic(p0: Point2D, cp: Point2D, p1: Point2D, t: number): Point2D {
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

function lerpPoint(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function distanceBetween(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
