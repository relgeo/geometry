/**
 * Low-level numeric policy for the geometry package.
 *
 * These values bound implementation comparisons and cleanup. They are not a
 * universal DSL epsilon and do not establish cross-runtime serialization
 * precision.
 */
export const GEOMETRY_TOLERANCES = Object.freeze({
  intersection: 1e-9,
  pathCleanup: 1e-7,
  splitDefault: 1e-6,
  splitEndpoint: 1e-9,
  modifier: 1e-9,
} as const);
