import type { Tuning, Box } from "./config";
import type { State } from "./simulation";
// Compound overlapping circles along each hull: rounded, conservative waterline shapes.
export function hullPoints(p: Tuning) {
  const result: { x: number; y: number }[] = [];
  const half = p.length / 2 - p.hullRadius;
  for (const x of [-p.beam / 2 + p.hullRadius, p.beam / 2 - p.hullRadius]) {
    for (let i = 0; i <= 16; i++)
      result.push({ x, y: -half + (2 * half * i) / 16 });
  }
  return result;
}
let cached: { key: string; points: ReturnType<typeof hullPoints> } | undefined;
export function resolveContacts(s: State, p: Tuning, boxes: Box[]) {
  const key = `${p.length}/${p.beam}/${p.hullRadius}`;
  if (cached?.key !== key) cached = { key, points: hullPoints(p) };
  // Sequential impulses, inelastic normal, mild tangential friction. Multiple position
  // passes avoid persistent penetration under thrust without target snapping.
  for (let pass = 0; pass < 8; pass++) {
    for (const point of cached.points) {
      const sn = Math.sin(s.heading),
        cs = Math.cos(s.heading);
      const rx = point.x * cs + point.y * sn,
        ry = -point.x * sn + point.y * cs;
      const x = s.x + rx,
        y = s.y + ry;
      for (const b of boxes) {
        const left = b.x - b.width / 2,
          right = b.x + b.width / 2;
        const bottom = b.y - b.length / 2,
          top = b.y + b.length / 2;
        const qx = Math.max(left, Math.min(right, x)),
          qy = Math.max(bottom, Math.min(top, y));
        let nx = x - qx,
          ny = y - qy;
        const dist = Math.hypot(nx, ny);
        if (dist >= p.hullRadius) continue;
        let depth = p.hullRadius - dist;
        if (dist > 1e-8) {
          nx /= dist;
          ny /= dist;
        } else {
          const edges = [x - left, right - x, y - bottom, top - y];
          const i = edges.indexOf(Math.min(...edges));
          nx = i === 0 ? -1 : i === 1 ? 1 : 0;
          ny = i === 2 ? -1 : i === 3 ? 1 : 0;
          depth = p.hullRadius + edges[i];
        }
        s.contact = true;
        const arm = ry * nx - rx * ny;
        const effective = 1 / p.mass + (arm * arm) / p.inertia;
        const vn = (s.vx + s.yaw * ry) * nx + (s.vy - s.yaw * rx) * ny;
        if (vn < 0) {
          s.impact = Math.max(s.impact, -vn);
          const impulse = -vn / effective;
          s.vx += (impulse * nx) / p.mass;
          s.vy += (impulse * ny) / p.mass;
          s.yaw += (impulse * arm) / p.inertia;
          const tx = -ny,
            ty = nx,
            ta = ry * tx - rx * ty;
          const vt = (s.vx + s.yaw * ry) * tx + (s.vy - s.yaw * rx) * ty;
          const friction = Math.max(
            -impulse * 0.18,
            Math.min(
              impulse * 0.18,
              -vt / (1 / p.mass + (ta * ta) / p.inertia),
            ),
          );
          s.vx += (friction * tx) / p.mass;
          s.vy += (friction * ty) / p.mass;
          s.yaw += (friction * ta) / p.inertia;
        }
        const correction = (Math.max(0, depth - 0.001) * 0.65) / effective;
        s.x += (correction * nx) / p.mass;
        s.y += (correction * ny) / p.mass;
        s.heading += (correction * arm) / p.inertia;
      }
    }
  }
}
