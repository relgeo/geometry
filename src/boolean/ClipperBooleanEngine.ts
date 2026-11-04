import polygonClipping from "polygon-clipping";
import type { BooleanEngine, ClosedShapeInput, PolyWithHoles, Polygon2D } from "./BooleanEngine";
import type { Point2D } from "../types";
import { normalizePolyWithHoles } from "./normalizeClosedShape";
import { GeometryError } from "../error";

function canonicalizeInput(shape: ClosedShapeInput): PolyWithHoles {
  if (!shape || typeof shape !== "object") {
    throw new GeometryError("boolean operand must be an object", "INVALID_CLOSED_SHAPE");
  }
  return normalizePolyWithHoles(shape.outer, shape.holes === undefined ? [] : shape.holes);
}

function canonicalizeInputs(shapes: ClosedShapeInput[]): PolyWithHoles[] {
  return shapes.map(canonicalizeInput);
}

function canonicalizeResults(results: PolyWithHoles[]): PolyWithHoles[] {
  const canonical = results.map((result) =>
    normalizePolyWithHoles(result.outer, result.holes ?? [])
  );

  // Multi-result order is semantic only as a collection order. Keep it
  // stable across equivalent operand orderings and polygon-clipping runs.
  return canonical.sort((a, b) => {
    const aPoint = a.outer[0];
    const bPoint = b.outer[0];
    if (!aPoint || !bPoint) return a.outer.length - b.outer.length;
    return aPoint.x - bPoint.x || aPoint.y - bPoint.y || a.outer.length - b.outer.length;
  });
}

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
    const canonicalShapes = canonicalizeInputs(shapes);
    if (canonicalShapes.length === 1) return canonicalShapes;
    
    const geoms = canonicalShapes.map(toPolygonClippingGeom);
    // union takes polygonClipping.Polygon[] and returns polygonClipping.MultiPolygon
    const result = polygonClipping.union.apply(polygonClipping, geoms as any);
    return canonicalizeResults(fromPolygonClippingGeom(result));
  }

  subtract(base: ClosedShapeInput, tools: ClosedShapeInput[]): PolyWithHoles[] {
    const canonicalBase = canonicalizeInput(base);
    const canonicalTools = canonicalizeInputs(tools);
    if (canonicalTools.length === 0) return [canonicalBase];
    
    const baseGeom = toPolygonClippingGeom(canonicalBase);
    const toolGeoms = canonicalTools.map(toPolygonClippingGeom);
    // difference takes a base polygon and subtracts tools, returning a MultiPolygon
    const result = polygonClipping.difference.apply(polygonClipping, [baseGeom, ...toolGeoms] as any);
    return canonicalizeResults(fromPolygonClippingGeom(result));
  }

  intersect(shapes: ClosedShapeInput[]): PolyWithHoles[] {
    if (shapes.length === 0) return [];
    const canonicalShapes = canonicalizeInputs(shapes);
    if (canonicalShapes.length === 1) return canonicalShapes;
    
    const first = toPolygonClippingGeom(canonicalShapes[0]);
    const rest = canonicalShapes.slice(1).map(toPolygonClippingGeom);
    const result = polygonClipping.intersection.apply(polygonClipping, [first, ...rest] as any);
    return canonicalizeResults(fromPolygonClippingGeom(result));
  }

  xor(shapes: ClosedShapeInput[]): PolyWithHoles[] {
    if (shapes.length === 0) return [];
    const canonicalShapes = canonicalizeInputs(shapes);
    if (canonicalShapes.length === 1) return canonicalShapes;
    
    const first = toPolygonClippingGeom(canonicalShapes[0]);
    const rest = canonicalShapes.slice(1).map(toPolygonClippingGeom);
    const result = polygonClipping.xor.apply(polygonClipping, [first, ...rest] as any);
    return canonicalizeResults(fromPolygonClippingGeom(result));
  }
}
