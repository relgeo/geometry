import type { BaseResolvedGroup, ResolvedTransform } from "./types";
import { GeometryError } from "./error";

export interface Point {
    x: number;
    y: number;
}

function assertFinitePoint(point: Point, label: string): void {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new GeometryError(`${label} must contain finite coordinates`, "INVALID_TRANSFORM");
    }
}

function assertFiniteTransform(transform: ResolvedTransform): void {
    for (const [index, op] of transform.entries()) {
        if (op.type === "translate") {
            if (!Number.isFinite(op.x) || !Number.isFinite(op.y)) {
                throw new GeometryError(`transform[${index}] contains non-finite translation`, "INVALID_TRANSFORM");
            }
        } else if (op.type === "rotate") {
            if (!Number.isFinite(op.angle)) {
                throw new GeometryError(`transform[${index}] contains a non-finite angle`, "INVALID_TRANSFORM");
            }
            assertFinitePoint(op.origin, `transform[${index}].origin`);
        } else if (op.type === "scale") {
            if (!Number.isFinite(op.factor[0]) || !Number.isFinite(op.factor[1])) {
                throw new GeometryError(`transform[${index}] contains non-finite scale factors`, "INVALID_TRANSFORM");
            }
            assertFinitePoint(op.origin, `transform[${index}].origin`);
        } else if (op.type === "mirror") {
            if (op.axis !== "x" && op.axis !== "y" && op.axis !== "both") {
                throw new GeometryError(`transform[${index}] has an invalid mirror axis`, "INVALID_TRANSFORM");
            }
            assertFinitePoint(op.origin, `transform[${index}].origin`);
        }
    }
}

export function applyTransformPipeline(
    point: Point,
    transform: ResolvedTransform
): Point {
    assertFinitePoint(point, "transform input");
    assertFiniteTransform(transform);
    let { x, y } = point;

    // SVG transforms are applied from right to left (last to first)
    // transform="A B" means A(B(pts))
    for (let i = transform.length - 1; i >= 0; i--) {
        const op = transform[i];
        if (op.type === "translate") {
            x += op.x;
            y += op.y;
        } else if (op.type === "rotate") {
            const { angle, origin } = op;
            const rad = (angle * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const dx = x - origin.x;
            const dy = y - origin.y;
            x = origin.x + dx * cos - dy * sin;
            y = origin.y + dx * sin + dy * cos;
        } else if (op.type === "scale") {
            const { factor, origin } = op;
            x = origin.x + (x - origin.x) * factor[0];
            y = origin.y + (y - origin.y) * factor[1];
        } else if (op.type === "mirror") {
            const { axis, origin } = op;
            if (axis === "x" || axis === "both") {
                x = origin.x - (x - origin.x);
            }
            if (axis === "y" || axis === "both") {
                y = origin.y - (y - origin.y);
            }
        }
    }

    const result = { x, y };
    assertFinitePoint(result, "transform result");
    return result;
}

export function applyGroupTransform(
    point: Point,
    group: BaseResolvedGroup
): Point {
    if (!group.transform) return point;
    return applyTransformPipeline(point, group.transform);
}
