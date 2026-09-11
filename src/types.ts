export type Point2D = { x: number; y: number };

export type LengthUnit = "px" | "mm" | "cm" | "m" | "in";
export type Orientation = "y-down" | "y-up";
export type Origin = "top-left" | "bottom-left" | "center";

export const TECHNICAL_ROLES = [
  "final",
  "construction",
  "guide",
  "centerline",
  "hidden",
  "section",
  "cut",
  "fold",
  "dimension",
  "annotation"
] as const;
export type TechnicalRole = typeof TECHNICAL_ROLES[number];
export interface Meta {
  visible?: boolean;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  /**
   * Deprecated compatibility alias for strokeWidth.
   * Prefer strokeWidth in active v0.4-facing surfaces.
   */
  width?: number;
  opacity?: number;
  label?: string;
  role?: TechnicalRole | string;
  intent?: string;
  layer?: string;
  dash?: string;
  pointShape?: "dot" | "cross" | "plus" | "circle" | "square" | "diamond" | string;
  color?: string;
  [key: string]: unknown;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseResolvedObject {
  id: string;
  type: string;
  meta?: Meta;
  anchors?: Record<string, { x: number; y: number }>;
  transform?: ResolvedTransform;
}

export interface ResolvedPoint extends BaseResolvedObject {
  type: "point";
  x: number;
  y: number;
}

export interface ResolvedLine extends BaseResolvedObject {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ResolvedRect extends BaseResolvedObject {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  holes?: { segments: PathResolvedSegment[] }[];
}

export interface ResolvedCircle extends BaseResolvedObject {
  type: "circle";
  cx: number;
  cy: number;
  radius: number;
  holes?: { segments: PathResolvedSegment[] }[];
}

export interface ResolvedEllipse extends BaseResolvedObject {
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation?: number;
  holes?: { segments: PathResolvedSegment[] }[];
}

export interface ResolvedArc extends BaseResolvedObject {
  type: "arc";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  xt?: number;
  yt?: number;
  cx?: number;
  cy?: number;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  sweep?: 0 | 1;
  largeArc?: 0 | 1;
}

export interface ResolvedCubic extends BaseResolvedObject {
  type: "cubic";
  x1: number;
  y1: number;
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
  x2: number;
  y2: number;
}

export interface ResolvedQuadratic extends BaseResolvedObject {
  type: "quadratic";
  x1: number;
  y1: number;
  cpx: number;
  cpy: number;
  x2: number;
  y2: number;
}

export interface ResolvedTranslateOp {
  type: "translate";
  x: number;
  y: number;
}

export interface ResolvedRotateOp {
  type: "rotate";
  angle: number;
  origin: { x: number; y: number };
}

export interface ResolvedScaleOp {
  type: "scale";
  factor: [number, number];
  origin: { x: number; y: number };
}

export interface ResolvedMirrorOp {
  type: "mirror";
  axis: "x" | "y" | "both";
  origin: { x: number; y: number };
}

export type ResolvedTransformOp =
  | ResolvedTranslateOp
  | ResolvedRotateOp
  | ResolvedScaleOp
  | ResolvedMirrorOp;

export type ResolvedTransform = ResolvedTransformOp[];

export interface BaseResolvedGroup extends BaseResolvedObject {
  children: string[];
}

export interface ResolvedGroup extends BaseResolvedGroup {
  type: "group";
}

export interface ResolvedClone extends BaseResolvedGroup {
  type: "clone";
  of: string;
}

export interface BaseResolvedOperation extends BaseResolvedGroup {
  target: string;
}

export interface ResolvedTranslateObject extends BaseResolvedOperation {
  type: "translate";
}

export interface ResolvedRotateObject extends BaseResolvedOperation {
  type: "rotate";
}

export interface ResolvedScaleObject extends BaseResolvedOperation {
  type: "scale";
}

export interface ResolvedMirrorObject extends BaseResolvedOperation {
  type: "mirror";
}

export interface ResolvedReverseObject extends BaseResolvedOperation {
  type: "reverse";
}

export interface ResolvedText extends BaseResolvedObject {
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string | number;
  anchor?:
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "centerLeft"
  | "center"
  | "centerRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";
}

export type PathResolvedSegment =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "arc"; x1: number; y1: number; xt?: number; yt?: number; x2: number; y2: number; cx: number; cy: number; radius: number; sweep: 0 | 1; largeArc: 0 | 1 }
  | { type: "quadratic"; x1: number; y1: number; cpx: number; cpy: number; x2: number; y2: number }
  | { type: "cubic"; x1: number; y1: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x2: number; y2: number };

export interface ResolvedPath extends BaseResolvedObject {
  type: "path";
  points?: { x: number; y: number }[];
  segments?: PathResolvedSegment[];
  closed?: boolean;
  holes?: { segments: PathResolvedSegment[] }[];
}

export interface ResolvedPolygon extends BaseResolvedObject {
  type: "polygon";
  points: { x: number; y: number }[];
  segments?: PathResolvedSegment[];
  holes?: { segments: PathResolvedSegment[] }[];
}

export interface ResolvedBoolean extends BaseResolvedObject {
  type: "boolean";
  operation: "union" | "subtract" | "intersect" | "xor";
  points?: { x: number; y: number }[];
  segments?: PathResolvedSegment[];
  holes?: { segments: PathResolvedSegment[] }[];
}

export interface ResolvedDimension extends BaseResolvedObject {
  type: "dimension";
  kind: "linear" | "radius" | "diameter" | "angle";
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  offset?: number;
  target?: string;
  between?: string[];
  text: string;
  distance?: number;
  angle?: number;
}

export interface ResolvedAnnotation extends BaseResolvedObject {
  type: "annotation";
  target?: string;
  text: string;
  leader?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
  };
  place?: any;
}

export interface ResolvedCollection extends BaseResolvedGroup {
  type: "collection";
}

export interface ResolvedComponent extends BaseResolvedGroup {
  type: "component";
  hasExports: boolean;
}

export type ResolvedObject =
  | ResolvedPoint
  | ResolvedLine
  | ResolvedRect
  | ResolvedCircle
  | ResolvedEllipse
  | ResolvedGroup
  | ResolvedClone
  | ResolvedTranslateObject
  | ResolvedRotateObject
  | ResolvedScaleObject
  | ResolvedMirrorObject
  | ResolvedReverseObject
  | ResolvedText
  | ResolvedPath
  | ResolvedPolygon
  | ResolvedArc
  | ResolvedCubic
  | ResolvedQuadratic
  | ResolvedBoolean
  | ResolvedDimension
  | ResolvedAnnotation
  | ResolvedCollection
  | ResolvedComponent;

export interface ConstraintViolation {
  type: 'align' | 'equal' | 'parallel' | 'perpendicular' | 'tangent';
  message: string;
  deviation: number;
  path: string;
  involvedObjects: string[];
  visualHelper?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface ResolvedSheetView {
  use: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedSheet {
  id: string;
  size: string | [number, number];
  width: number;
  height: number;
  views: ResolvedSheetView[];
  meta?: Meta;
}

export interface ResolvedView {
  id: string;
  target: string;
  scale: string | number;
  scaleFactor: number;
  objects: Record<string, ResolvedObject>;
  bbox: BoundingBox;
  meta?: Meta;
}

export interface ResolvedScene {
  unit: LengthUnit;
  orientation?: Orientation;
  origin?: Origin;
  autoSize?: boolean;
  padding?: number;
  objects: Record<string, ResolvedObject>;
  parameters: Record<string, unknown>;
  values: Record<string, number>;
  bbox: BoundingBox;
  meta?: Meta;
  violations?: ConstraintViolation[];
  sheets?: Record<string, ResolvedSheet>;
  views?: Record<string, ResolvedView>;
}
