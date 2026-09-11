import { applyTransformPipeline } from "./transforms";

export function normalizeAngle(angle: number): number {
    const fullTurn = Math.PI * 2;
    let value = angle % fullTurn;
    if (value < 0) value += fullTurn;
    return value;
}

export function isAngleOnSweep(start: number, end: number, target: number, sweep: 0 | 1 = 1): boolean {
    const s = normalizeAngle(start);
    const e = normalizeAngle(end);
    const t = normalizeAngle(target);

    if (sweep === 1) {
        if (s <= e) return t >= s && t <= e;
        return t >= s || t <= e;
    }

    if (e <= s) return t <= s && t >= e;
    return t <= s || t >= e;
}

export function sampleQuadraticPoints(obj: any, steps = 48): { x: number, y: number }[] {
    const points: { x: number, y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        points.push({
            x: mt * mt * obj.x1 + 2 * mt * t * obj.cpx + t * t * obj.x2,
            y: mt * mt * obj.y1 + 2 * mt * t * obj.cpy + t * t * obj.y2,
        });
    }
    return points;
}

export function sampleCubicPoints(obj: any, steps = 64): { x: number, y: number }[] {
    const points: { x: number, y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        points.push({
            x:
                mt * mt * mt * obj.x1 +
                3 * mt * mt * t * obj.cp1x +
                3 * mt * t * t * obj.cp2x +
                t * t * t * obj.x2,
            y:
                mt * mt * mt * obj.y1 +
                3 * mt * mt * t * obj.cp1y +
                3 * mt * t * t * obj.cp2y +
                t * t * t * obj.y2,
        });
    }
    return points;
}

export function sampleSegmentLikePoints(segment: any, steps = 32): { x: number, y: number }[] {
    if (segment.type === "line") {
        return [
            { x: segment.x1, y: segment.y1 },
            { x: segment.x2, y: segment.y2 }
        ];
    }
    if (segment.type === "arc") {
        const startAngle = Math.atan2(segment.y1 - segment.cy, segment.x1 - segment.cx);
        let endAngle = Math.atan2(segment.y2 - segment.cy, segment.x2 - segment.cx);
        if (segment.sweep === 1 && endAngle < startAngle) endAngle += Math.PI * 2;
        if (segment.sweep === 0 && endAngle > startAngle) endAngle -= Math.PI * 2;
        const points: { x: number, y: number }[] = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const angle = startAngle + (endAngle - startAngle) * t;
            points.push({
                x: segment.cx + segment.radius * Math.cos(angle),
                y: segment.cy + segment.radius * Math.sin(angle),
            });
        }
        return points;
    }
    if (segment.type === "quadratic") {
        return sampleQuadraticPoints(segment, Math.max(steps, 48));
    }
    return sampleCubicPoints(segment, Math.max(steps, 64));
}

export function samplePathLikeObject(obj: any): { x: number, y: number }[] {
    const segments = Array.isArray(obj.segments) ? obj.segments : [];
    if (segments.length > 0) {
        const points: { x: number, y: number }[] = [];
        segments.forEach((segment: any, index: number) => {
            const sampled = sampleSegmentLikePoints(segment);
            if (index === 0) points.push(...sampled);
            else points.push(...sampled.slice(1));
        });
        return points;
    }
    return (obj.points ?? []).map((p: any) => ({ x: p.x, y: p.y }));
}

import type { BoundingBox } from "./types";

export interface BboxOptions {
    ignoreRoles?: string[];
}

export function calculateBoundingBox(objects: Record<string, any>, parentMapOrInitialTransform?: Map<string, string> | any[], options?: BboxOptions) {
    let defaultInitialTransform: any[] = [];
    if (Array.isArray(parentMapOrInitialTransform)) {
        defaultInitialTransform = parentMapOrInitialTransform;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const addPoints = (pts: { x: number, y: number }[]) => {
        pts.forEach(p => {
            if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
        });
    };

    function getPointsForObject(obj: any): { x: number, y: number }[] {
        if (obj.type === "point") {
            return [{ x: obj.x, y: obj.y }];
        } else if (obj.type === "rect") {
            return [
                { x: obj.x, y: obj.y },
                { x: obj.x + obj.width, y: obj.y },
                { x: obj.x, y: obj.y + obj.height },
                { x: obj.x + obj.width, y: obj.y + obj.height }
            ];
        } else if (obj.type === "line") {
            return [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
        } else if (obj.type === "circle") {
            return [
                { x: obj.cx - obj.radius, y: obj.cy },
                { x: obj.cx + obj.radius, y: obj.cy },
                { x: obj.cx, y: obj.cy - obj.radius },
                { x: obj.cx, y: obj.cy + obj.radius }
            ];
        } else if (obj.type === "ellipse") {
            const rotation = obj.rotation ?? 0;
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            const halfWidth = Math.sqrt((obj.rx * cos) ** 2 + (obj.ry * sin) ** 2);
            const halfHeight = Math.sqrt((obj.rx * sin) ** 2 + (obj.ry * cos) ** 2);
            return [
                { x: obj.cx - halfWidth, y: obj.cy },
                { x: obj.cx + halfWidth, y: obj.cy },
                { x: obj.cx, y: obj.cy - halfHeight },
                { x: obj.cx, y: obj.cy + halfHeight }
            ];
        } else if (obj.type === "arc") {
            const points = [
                { x: obj.x1, y: obj.y1 },
                { x: obj.x2, y: obj.y2 }
            ];
            if (obj.xt !== undefined && obj.yt !== undefined) {
                points.push({ x: obj.xt, y: obj.yt });
            }
            if (
                obj.cx !== undefined &&
                obj.cy !== undefined &&
                obj.radius !== undefined &&
                obj.startAngle !== undefined &&
                obj.endAngle !== undefined
            ) {
                const candidateAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
                candidateAngles.forEach((angle) => {
                    if (isAngleOnSweep(obj.startAngle!, obj.endAngle!, angle, obj.sweep ?? 1)) {
                        points.push({
                            x: obj.cx + obj.radius * Math.cos(angle),
                            y: obj.cy + obj.radius * Math.sin(angle),
                        });
                    }
                });
            }
            return points;
        } else if (obj.type === "quadratic") {
            return sampleQuadraticPoints(obj);
        } else if (obj.type === "cubic") {
            return sampleCubicPoints(obj);
        } else if (obj.type === "path") {
            return samplePathLikeObject(obj);
        } else if (obj.type === "polygon") {
            return samplePathLikeObject(obj);
        } else if (obj.type === "boolean") {
            return samplePathLikeObject(obj);
        } else if (obj.type === "text") {
            const pts = [{ x: obj.x, y: obj.y }];
            if (obj.width !== undefined && obj.height !== undefined) {
                pts.push({ x: obj.x + obj.width, y: obj.y + obj.height });
            }
            return pts;
        }
        return [];
    }

    function recurse(objId: string, currentTransform: any[], parentMeta: any = {}, isCloneDescendant: boolean = false) {
        const obj = objects[objId];
        if (!obj) return;

        const meta = isCloneDescendant ? { ...obj.meta, ...parentMeta } : { ...parentMeta, ...obj.meta };
        if (meta.visible === false) return;
        
        if (meta.role && options?.ignoreRoles?.includes(meta.role)) {
            return; // Skip calculating bbox for this object and its children if ignored
        }

        const combinedTransform = obj.transform ? [...obj.transform, ...currentTransform] : currentTransform;

        // 1. Collect points of the object itself
        const localPts = getPointsForObject(obj);
        if (localPts.length > 0) {
            const worldPts = localPts.map(pt => applyTransformPipeline(pt, combinedTransform));
            addPoints(worldPts);
        }

        // 2. Recurse into children if any
        if (obj.children && Array.isArray(obj.children)) {
            for (const childId of obj.children) {
                recurse(childId, combinedTransform, meta, isCloneDescendant || obj.type === "clone");
            }
        }
    }

    // Identify root objects (those that are not children of anyone)
    const childIds = new Set<string>();
    for (const obj of Object.values(objects)) {
        if (obj.children && Array.isArray(obj.children)) {
            for (const cid of obj.children) childIds.add(cid);
        }
    }

    const rootIds = Object.keys(objects).filter(id => !childIds.has(id));

    for (const id of rootIds) {
        let baseTransform = [...defaultInitialTransform];
        if (parentMapOrInitialTransform instanceof Map) {
            let curr = parentMapOrInitialTransform.get(id);
            while (curr) {
                if (objects[curr] && objects[curr].transform) {
                    baseTransform.push(...objects[curr].transform);
                }
                curr = parentMapOrInitialTransform.get(curr);
            }
        }
        recurse(id, baseTransform);
    }

    if (minX === Infinity) {
        return { x: 0, y: 0, width: 800, height: 600 };
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

export function getObjectBoundingBox(targetId: string, objects: Record<string, any>, options?: BboxOptions, parentMap?: Map<string, string>): BoundingBox {
    const subset: Record<string, any> = {};
    const gather = (id: string) => {
        if (subset[id] || !objects[id]) return;
        subset[id] = objects[id];
        const children = objects[id].children;
        if (children && Array.isArray(children)) {
            for (const childId of children) gather(childId);
        }
    };
    gather(targetId);
    let initialTransform: any[] = [];
    if (parentMap) {
        let curr = parentMap.get(targetId);
        while (curr) {
            if (objects[curr] && objects[curr].transform) {
                initialTransform.push(...objects[curr].transform);
            }
            curr = parentMap.get(curr);
        }
    }
    
    return calculateBoundingBox(subset, initialTransform, options);
}
