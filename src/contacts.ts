import { fenderConfig, type Tuning, type Box, STEP } from "./config";
import type { State } from "./simulation";
import { coveredFender, initialFenders, type Fenders } from "./fenders";
export type ContactSample = {
  obstacleId: string;
  obstacleName: string;
  side: "port" | "starboard";
  worldX: number;
  worldY: number;
  localX: number;
  localY: number;
  normalX: number;
  normalY: number;
  speed: number;
  impulse: number;
  covered: boolean;
  fendersDeployed: { port: boolean; starboard: boolean };
  hullContact: boolean;
  compression: number;
};
// Compound overlapping circles along each hull: rounded, conservative waterline shapes.
export function hullPoints(p: Tuning) {
  const result: { x: number; y: number }[] = [];
  const half = p.length / 2 - p.hullRadius;
  for (const x of [-p.beam / 2 + p.hullRadius, p.beam / 2 - p.hullRadius])
    for (let i = 0; i <= 16; i++)
      result.push({ x, y: -half + (2 * half * i) / 16 });
  return result;
}
let cached: { key: string; points: ReturnType<typeof hullPoints> } | undefined;
export function resolveContacts(
  s: State,
  p: Tuning,
  boxes: Box[],
  fenders: Fenders = initialFenders(),
  dt = STEP,
): ContactSample[] {
  const key = `${p.length}/${p.beam}/${p.hullRadius}`;
  if (cached?.key !== key) cached = { key, points: hullPoints(p) };
  const samples: ContactSample[] = [];
  // Report incoming point velocities BEFORE any solver impulses. Otherwise an
  // earlier constraint can hide a later bow/stern impact (especially during yaw).
  const incoming = {
    vx: s.vx,
    vy: s.vy,
    yaw: s.yaw,
    sn: Math.sin(s.heading),
    cs: Math.cos(s.heading),
  };
  // One bounded soft impulse per physical fender per tick, then hard-hull
  // sequential constraints. All eight passes report impulses; correction does NOT.
  const cushioned = new Set<string>();
  for (let pass = 0; pass < 8; pass++) {
    for (const point of cached.points) {
      const sn = Math.sin(s.heading),
        cs = Math.cos(s.heading);
      const rx = point.x * cs + point.y * sn,
        ry = -point.x * sn + point.y * cs;
      const x = s.x + rx,
        y = s.y + ry;
      for (const [boxIndex, b] of boxes.entries()) {
        const left = b.x - b.width / 2,
          right = b.x + b.width / 2;
        const bottom = b.y - b.length / 2,
          top = b.y + b.length / 2;
        const qx = Math.max(left, Math.min(right, x)),
          qy = Math.max(bottom, Math.min(top, y));
        let nx = x - qx,
          ny = y - qy;
        const dist = Math.hypot(nx, ny);
        if (dist >= p.hullRadius + fenderConfig.thickness) continue;
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
        const cover = coveredFender(
          point.x,
          point.y,
          nx * cs - ny * sn,
          fenders,
        );
        const hullContact = depth > 0;
        if (!hullContact && (!cover || pass > 0)) continue;
        s.contact = true;
        const arm = ry * nx - rx * ny,
          effective = 1 / p.mass + (arm * arm) / p.inertia;
        const vn = (s.vx + s.yaw * ry) * nx + (s.vy - s.yaw * rx) * ny;
        const incomingRx = point.x * incoming.cs + point.y * incoming.sn;
        const incomingRy = -point.x * incoming.sn + point.y * incoming.cs;
        const speed = Math.max(
          0,
          -(
            (incoming.vx + incoming.yaw * incomingRy) * nx +
            (incoming.vy - incoming.yaw * incomingRx) * ny
          ),
        );
        s.impact = Math.max(s.impact, speed);
        let impulse = 0;
        const compression = cover
          ? Math.min(
              fenderConfig.thickness,
              Math.max(0, depth + fenderConfig.thickness),
            )
          : 0;
        if (hullContact) {
          // Bottomed-out fenders still meet the hard hull; they cannot defeat walls.
          impulse = Math.max(0, -vn) / effective;
        } else if (cover && pass === 0) {
          const fenderKey = `${cover.side}/${cover.index}`;
          if (!cushioned.has(fenderKey)) {
            cushioned.add(fenderKey);
            const force = Math.min(
              fenderConfig.maxForce,
              Math.max(
                0,
                fenderConfig.stiffness * compression -
                  fenderConfig.damping * vn,
              ),
            );
            // Bounded recovery speed avoids energetic spring launches.
            impulse = Math.min(
              force * dt,
              Math.max(0, (0.05 - vn) / effective),
            );
          }
        }
        s.vx += (impulse * nx) / p.mass;
        s.vy += (impulse * ny) / p.mass;
        s.yaw += (impulse * arm) / p.inertia;
        if (hullContact && impulse > 0) {
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
        samples.push({
          obstacleId: b.id ?? `obstacle-${boxIndex}`,
          obstacleName: b.name ?? b.kind,
          side: point.x < 0 ? "port" : "starboard",
          worldX: x - nx * p.hullRadius,
          worldY: y - ny * p.hullRadius,
          localX: point.x - (nx * cs - ny * sn) * p.hullRadius,
          localY: point.y - (nx * sn + ny * cs) * p.hullRadius,
          normalX: nx,
          normalY: ny,
          speed,
          impulse,
          covered: !!cover,
          fendersDeployed: {
            port: fenders.port.deployed,
            starboard: fenders.starboard.deployed,
          },
          hullContact,
          compression,
        });
        if (hullContact) {
          const correction = (Math.max(0, depth - 0.001) * 0.65) / effective;
          s.x += (correction * nx) / p.mass;
          s.y += (correction * ny) / p.mass;
          s.heading += (correction * arm) / p.inertia;
        }
      }
    }
  }
  return samples;
}
