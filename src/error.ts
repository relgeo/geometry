export class GeometryError extends Error {
  constructor(
    message: string,
    public code:
      | "INVALID_CORNER_OPERATION"
      | "INVALID_OFFSET"
      | "SELF_INTERSECTING_PATH"
      | "INVALID_SPLIT_TARGET"
      | "SPLIT_POINT_OFF_TARGET"
      | "DEGENERATE_SPLIT"
      | "SPLIT_RESOLUTION_FAILED"
  ) {
    const fullMessage = `${code}: ${message}`;
    super(fullMessage);
    this.message = fullMessage;
    this.name = "GeometryError";
  }
}
