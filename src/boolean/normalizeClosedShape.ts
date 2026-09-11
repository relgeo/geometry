import type { ResolvedObject, PathResolvedSegment } from "../types";
import type { PolyWithHoles, Polygon2D } from "./BooleanEngine";
import { samplePathLikeObject } from "../utils";
import { applyTransformPipeline } from "../transforms";

export function cleanPoints(points: { x: number, y: number }[]): { x: number, y: number }[] {
  const result: { x: number, y: number }[] = [];
  for (const p of points) {
    if (result.length === 0) {
      result.push(p);
      continue;
    }
    const last = result[result.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (Math.hypot(dx, dy) > 1e-7) {
      result.push(p);
    }
  }
  if (result.length > 1) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-7) {
      result.pop();
    }
  }
  return result;
}

export function normalizeClosedShape(
  obj: ResolvedObject,
  allObjects?: Record<string, ResolvedObject>
): PolyWithHoles {
  if (obj.type === "rect") {
    const outer = cleanPoints([
      { x: obj.x, y: obj.y },
      { x: obj.x + obj.width, y: obj.y },
      { x: obj.x + obj.width, y: obj.y + obj.height },
      { x: obj.x, y: obj.y + obj.height },
    ]);
    const holes = ((obj as any).holes || []).map((h: any) => cleanPoints(samplePathLikeObject(h)));
    return { outer, holes: holes.length > 0 ? holes : undefined };
  }
  
  if (obj.type === "circle") {
    const outer = [];
    const segments = 64;
    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      outer.push({
        x: obj.cx + obj.radius * Math.cos(angle),
        y: obj.cy + obj.radius * Math.sin(angle),
      });
    }
    const holes = ((obj as any).holes || []).map((h: any) => cleanPoints(samplePathLikeObject(h)));
    return { outer: cleanPoints(outer), holes: holes.length > 0 ? holes : undefined };
  }
  
  if (obj.type === "polygon") {
    const outer = cleanPoints(samplePathLikeObject(obj));
    const holes = ((obj as any).holes || []).map((h: any) => cleanPoints(samplePathLikeObject(h)));
    return { outer, holes: holes.length > 0 ? holes : undefined };
  }
  
  if (obj.type === "path") {
    const outer = cleanPoints(samplePathLikeObject(obj));
    const holes = (obj.holes || []).map((h: any) => cleanPoints(samplePathLikeObject(h)));
    return { outer, holes: holes.length > 0 ? holes : undefined };
  }
  
  if (obj.type === "boolean") {
    const outer = cleanPoints(samplePathLikeObject(obj));
    const holes = (obj.holes || []).map((h: any) => cleanPoints(samplePathLikeObject(h)));
    return { outer, holes: holes.length > 0 ? holes : undefined };
  }

  if (obj.type === "clone") {
    const target = allObjects ? allObjects[obj.of] : undefined;
    if (!target) {
      throw new Error(`Cannot normalize clone without its target resolved object: ${obj.of}`);
    }
    const targetNormalized = normalizeClosedShape(target, allObjects);
    const transform = obj.transform;
    if (transform && transform.length > 0) {
      const applyT = (pt: { x: number, y: number }) => applyTransformPipeline(pt, transform);
      const outer = targetNormalized.outer.map(applyT);
      const holes = targetNormalized.holes
        ? targetNormalized.holes.map(h => h.map(applyT))
        : undefined;
      return { outer, holes };
    }
    return targetNormalized;
  }
  
  throw new Error(`Unsupported closed shape type: ${obj.type}`);
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
