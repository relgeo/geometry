import type { IntersectionSelector } from "../intersection";

export type GeometryContractCase = {
  id: string;
  category: "success" | "empty" | "multiple" | "unsupported" | "boundary" | "invalid";
  left: Record<string, unknown>;
  right: Record<string, unknown>;
  expectedPoints?: Array<{ x: number; y: number }>;
  expectedError?: string;
};

/**
 * Deterministic low-level contract fixture for GAP-GEO-QUERY-004 and the
 * numeric/error boundaries selected with it. Keep this fixture independent of
 * parser, resolver, renderer, and host-runtime behavior.
 */
export const geometryContractFixture: GeometryContractCase[] = [
  {
    id: "success-line-line-single",
    category: "success",
    left: { id: "horizontal", type: "line", x1: 0, y1: 5, x2: 10, y2: 5 },
    right: { id: "vertical", type: "line", x1: 5, y1: 0, x2: 5, y2: 10 },
    expectedPoints: [{ x: 5, y: 5 }],
  },
  {
    id: "multiple-circle-line",
    category: "multiple",
    left: { id: "circle", type: "circle", cx: 0, cy: 0, radius: 10 },
    right: { id: "diameter", type: "line", x1: -20, y1: 0, x2: 20, y2: 0 },
    expectedPoints: [{ x: -10, y: 0 }, { x: 10, y: 0 }],
  },
  {
    id: "empty-parallel-lines",
    category: "empty",
    left: { id: "line-a", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 },
    right: { id: "line-b", type: "line", x1: 0, y1: 5, x2: 10, y2: 5 },
    expectedPoints: [],
  },
  {
    id: "unsupported-text-circle",
    category: "unsupported",
    left: { id: "label", type: "text", x: 0, y: 0, width: 10, height: 10 },
    right: { id: "circle", type: "circle", cx: 0, cy: 0, radius: 5 },
    expectedError: "UNSUPPORTED_FEATURE",
  },
  {
    id: "boundary-circle-line-tangent",
    category: "boundary",
    left: { id: "circle", type: "circle", cx: 0, cy: 0, radius: 10 },
    right: { id: "tangent", type: "line", x1: -20, y1: 10, x2: 20, y2: 10 },
    expectedPoints: [{ x: 0, y: 10 }],
  },
  {
    id: "invalid-zero-length-line",
    category: "invalid",
    left: { id: "degenerate", type: "line", x1: 0, y1: 0, x2: 0, y2: 0 },
    right: { id: "circle", type: "circle", cx: 0, cy: 0, radius: 5 },
    expectedError: "INVALID_INTERSECTION_INPUT",
  },
];

export const selectorContractFixture: Array<{
  id: string;
  selector: IntersectionSelector | undefined;
  expectedPoint?: { x: number; y: number };
  expectedError?: string;
}> = [
  { id: "implicit-single", selector: undefined, expectedPoint: { x: 5, y: 5 } },
  { id: "implicit-multiple-rejected", selector: undefined, expectedError: "MULTIPLE_INTERSECTIONS" },
  { id: "implicit-empty-rejected", selector: undefined, expectedError: "NO_INTERSECTION" },
  { id: "first", selector: "first", expectedPoint: { x: -10, y: 0 } },
  { id: "last", selector: "last", expectedPoint: { x: 10, y: 0 } },
  { id: "index-one", selector: { index: 1 }, expectedPoint: { x: 10, y: 0 } },
  { id: "nearest-origin", selector: { nearest: { x: -9, y: 0 } }, expectedPoint: { x: -10, y: 0 } },
  { id: "farthest-origin", selector: { farthest: { x: 0, y: 0 } }, expectedPoint: { x: -10, y: 0 } },
  { id: "index-out-of-range", selector: { index: 2 }, expectedError: "INTERSECTION_INDEX_OUT_OF_RANGE" },
];
