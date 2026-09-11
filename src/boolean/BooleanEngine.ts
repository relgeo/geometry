import type { Point2D } from "../types";

export type Polygon2D = Point2D[];

export interface PolyWithHoles {
  outer: Polygon2D;
  holes?: Polygon2D[];
}

export type ClosedShapeInput = PolyWithHoles;

export interface BooleanEngine {
  union(shapes: ClosedShapeInput[]): PolyWithHoles[];
  subtract(base: ClosedShapeInput, tools: ClosedShapeInput[]): PolyWithHoles[];
  intersect(shapes: ClosedShapeInput[]): PolyWithHoles[];
  xor(shapes: ClosedShapeInput[]): PolyWithHoles[];
}
