import polygonClipping from "polygon-clipping";
import type { BooleanEngine, ClosedShapeInput, PolyWithHoles, Polygon2D } from "./BooleanEngine";
import type { Point2D } from "../types";

function toPolygonClippingGeom(shape: ClosedShapeInput): polygonClipping.Polygon {
  const outerRing = shape.outer.map((p) => [p.x, p.y] as [number, number]);
  const holeRings = (shape.holes || []).map((h) => h.map((p) => [p.x, p.y] as [number, number]));
  return [outerRing, ...holeRings];
}

function fromPolygonClippingGeom(geom: polygonClipping.MultiPolygon): PolyWithHoles[] {
  return geom.map((poly) => {
    const outer: Polygon2D = poly[0].map(([x, y]) => ({ x, y }));
    const holes: Polygon2D[] = poly.slice(1).map((ring) => ring.map(([x, y]) => ({ x, y })));
    return {
      outer,
      holes: holes.length > 0 ? holes : undefined,
    };
  });
}

export class ClipperBooleanEngine implements BooleanEngine {
  union(shapes: ClosedShapeInput[]): PolyWithHoles[] {
    if (shapes.length === 0) return [];
    if (shapes.length === 1) return [shapes[0]];
    
    const geoms = shapes.map(toPolygonClippingGeom);
    // union takes polygonClipping.Polygon[] and returns polygonClipping.MultiPolygon
    const result = polygonClipping.union.apply(polygonClipping, geoms as any);
    return fromPolygonClippingGeom(result);
  }

  subtract(base: ClosedShapeInput, tools: ClosedShapeInput[]): PolyWithHoles[] {
    if (tools.length === 0) return [base];
    
    const baseGeom = toPolygonClippingGeom(base);
    const toolGeoms = tools.map(toPolygonClippingGeom);
    // difference takes a base polygon and subtracts tools, returning a MultiPolygon
    const result = polygonClipping.difference.apply(polygonClipping, [baseGeom, ...toolGeoms] as any);
    return fromPolygonClippingGeom(result);
  }

  intersect(shapes: ClosedShapeInput[]): PolyWithHoles[] {
    if (shapes.length === 0) return [];
    if (shapes.length === 1) return [shapes[0]];
    
    const first = toPolygonClippingGeom(shapes[0]);
    const rest = shapes.slice(1).map(toPolygonClippingGeom);
    const result = polygonClipping.intersection.apply(polygonClipping, [first, ...rest] as any);
    return fromPolygonClippingGeom(result);
  }

  xor(shapes: ClosedShapeInput[]): PolyWithHoles[] {
    if (shapes.length === 0) return [];
    if (shapes.length === 1) return [shapes[0]];
    
    const first = toPolygonClippingGeom(shapes[0]);
    const rest = shapes.slice(1).map(toPolygonClippingGeom);
    const result = polygonClipping.xor.apply(polygonClipping, [first, ...rest] as any);
    return fromPolygonClippingGeom(result);
  }
}
