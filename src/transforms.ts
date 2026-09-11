import type { BaseResolvedGroup, ResolvedTransform } from "./types";

export interface Point {
    x: number;
    y: number;
}

export function applyTransformPipeline(
    point: Point,
    transform: ResolvedTransform
): Point {
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

    return { x, y };
}

export function applyGroupTransform(
    point: Point,
    group: BaseResolvedGroup
): Point {
    if (!group.transform) return point;
    return applyTransformPipeline(point, group.transform);
}
