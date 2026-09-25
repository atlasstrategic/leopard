import { boat, mooringConfig, scenario, type Box, type Tuning } from "./config";
import type { State } from "./simulation";
export type LineId = keyof typeof mooringConfig.lines;
export const lineIds: LineId[] = ["bow", "stern"];
export type MooringLine = {
  attached: boolean;
  restLength: number;
  tension: number;
  extension: number;
  peakTension: number;
  overloadTime: number;
  warning: boolean;
  broken: boolean;
  tending: "idle" | "in" | "out";
  adjustmentRemaining: number;
  restRate: number;
  tendStatus: string;
};
export type Mooring = Record<LineId, MooringLine>;
export const initialLine = (): MooringLine => ({
  attached: false,
  restLength: 0,
  tension: 0,
  extension: 0,
  peakTension: 0,
  overloadTime: 0,
  warning: false,
  broken: false,
  tending: "idle",
  adjustmentRemaining: 0,
  restRate: 0,
  tendStatus: "",
});
export const initialMooring = (): Mooring => ({
  bow: initialLine(),
  stern: initialLine(),
});
export function fairlead(s: State, id: LineId) {
  const p = mooringConfig.lines[id].fairlead,
    sn = Math.sin(s.heading),
    cs = Math.cos(s.heading);
  const rx = p.x * cs + p.y * sn,
    ry = -p.x * sn + p.y * cs;
  return {
    x: s.x + rx,
    y: s.y + ry,
    rx,
    ry,
    vx: s.vx + s.yaw * ry,
    vy: s.vy - s.yaw * rx,
  };
}
export function lineGeometry(s: State, id: LineId) {
  const point = fairlead(s, id),
    anchor = mooringConfig.lines[id].anchor;
  const dx = anchor.x - point.x,
    dy = anchor.y - point.y,
    distance = Math.hypot(dx, dy);
  return {
    point,
    anchor,
    distance,
    ux: distance > 1e-8 ? dx / distance : 0,
    uy: distance > 1e-8 ? dy / distance : 0,
  };
}
// Segment/AABB slab test for occluding docks and boundary walls.
function intersects(
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: Box,
) {
  let lo = 0,
    hi = 1;
  for (const [axis, half] of [
    ["x", box.width / 2],
    ["y", box.length / 2],
  ] as const) {
    const d = b[axis] - a[axis],
      min = box[axis] - half,
      max = box[axis] + half;
    if (Math.abs(d) < 1e-10) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const t1 = (min - a[axis]) / d,
        t2 = (max - a[axis]) / d;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}
export function attachmentCheck(
  s: State,
  id: LineId,
  obstacles: Box[] = scenario.obstacles,
  acceptableContact = false,
) {
  const g = lineGeometry(s, id),
    def = mooringConfig.lines[id];
  const quay = obstacles.find((b) => b.id === def.obstacleId);
  if (!quay) return { ok: false, reason: "Bollard quay unavailable", ...g };
  // Only the water-facing west edge of this authored quay is an attachment face.
  if (
    g.point.x >= quay.x - quay.width / 2 - 0.05 ||
    g.point.y < quay.y - quay.length / 2 ||
    g.point.y > quay.y + quay.length / 2
  )
    return {
      ok: false,
      reason: "Approach the water-facing side of the quay",
      ...g,
    };
  if (g.ux * Math.cos(s.heading) - g.uy * Math.sin(s.heading) < 0.2)
    return {
      ok: false,
      reason:
        "Keep the quay on the starboard side; do not lead a line across the boat",
      ...g,
    };
  if (g.distance > mooringConfig.reach)
    return {
      ok: false,
      reason: `Out of reach (${g.distance.toFixed(1)} / ${mooringConfig.reach} m)`,
      ...g,
    };
  if (
    obstacles.some(
      (b) => b.id !== def.obstacleId && intersects(g.point, g.anchor, b),
    )
  )
    return { ok: false, reason: "Line route blocked by an obstacle", ...g };
  if (
    Math.hypot(g.point.vx, g.point.vy) > mooringConfig.maxPointSpeed ||
    Math.abs(s.yaw) > mooringConfig.maxYaw
  )
    return {
      ok: false,
      reason: "Slow down: fairlead speed ≤0.25 m/s and yaw ≤1.43°/s",
      ...g,
    };
  if (s.contact && !acceptableContact)
    return {
      ok: false,
      reason: "Clear the obstacle contact before attaching",
      ...g,
    };
  return { ok: true, reason: `Within reach of ${def.bollard}`, ...g };
}
// Soft tension-only constraints. Slack lines exert NO force, never compression.
// Effective mass and implicit damping limit timestep sensitivity. No pose projection.
export function mooringForces(
  s: State,
  mooring: Mooring,
  dt: number,
  p: Tuning = boat,
) {
  let fx = 0,
    fy = 0,
    torque = 0;
  for (const id of lineIds) {
    const line = mooring[id];
    if (!line.attached) {
      line.tension = 0;
      line.extension = 0;
      line.warning = false;
      continue;
    }
    const g = lineGeometry(s, id);
    line.extension = Math.max(0, g.distance - line.restLength);
    let requested = 0;
    if (line.extension > 0) {
      const rate = -(g.point.vx * g.ux + g.point.vy * g.uy) - line.restRate;
      const arm = g.point.ry * g.ux - g.point.rx * g.uy;
      const inverseMass = 1 / p.mass + (arm * arm) / p.inertia;
      requested = Math.max(
        0,
        (mooringConfig.stiffness * line.extension +
          mooringConfig.damping * rate) /
          (1 +
            (mooringConfig.damping * dt + mooringConfig.stiffness * dt * dt) *
              inverseMass),
      );
    }
    line.tension = Math.min(requested, mooringConfig.breakLoad);
    line.peakTension = Math.max(line.peakTension, line.tension);
    line.overloadTime =
      requested >= mooringConfig.breakLoad ? line.overloadTime + dt : 0;
    line.warning = line.warning
      ? line.tension > mooringConfig.warningLoad * 0.8
      : line.tension >= mooringConfig.warningLoad;
    if (line.overloadTime + 1e-8 >= mooringConfig.breakDelay) {
      line.attached = false;
      line.broken = true;
      line.tending = "idle";
      line.adjustmentRemaining = 0;
      line.restRate = 0;
      line.tendStatus = "Line failed";
      line.tension = 0;
      line.warning = false;
      continue;
    }
    const x = line.tension * g.ux,
      y = line.tension * g.uy;
    fx += x;
    fy += y;
    torque += g.point.ry * x - g.point.rx * y;
  }
  return { fx, fy, torque };
}
