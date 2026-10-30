export type GeometryErrorCode =
  | "INVALID_CORNER_OPERATION"
  | "INVALID_OFFSET"
  | "SELF_INTERSECTING_PATH"
  | "INVALID_SPLIT_TARGET"
  | "SPLIT_POINT_OFF_TARGET"
  | "DEGENERATE_SPLIT"
  | "SPLIT_RESOLUTION_FAILED"
  | "INVALID_CLOSED_SHAPE"
  | "MISSING_CLONE_TARGET"
  | "NO_INTERSECTION"
  | "MULTIPLE_INTERSECTIONS"
  | "INTERSECTION_INDEX_OUT_OF_RANGE"
  | "INVALID_INTERSECTION_SELECTOR"
  | "INVALID_INTERSECTION_INPUT"
  | "UNSUPPORTED_FEATURE";

export class GeometryError extends Error {
  constructor(
    message: string,
    public code: GeometryErrorCode
  ) {
    const fullMessage = `${code}: ${message}`;
    super(fullMessage);
    this.message = fullMessage;
    this.name = "GeometryError";
  }
}
