import { angle, trafficConfig, type Tuning } from "./config";
import { hullPoints } from "./contacts";
import type { State } from "./simulation";

export type VesselStatus = "moored" | "departing" | "yielding" | "gone";
export type Vessel = {
  x: number;
  y: number;
  heading: number;
  // Signed m/s along the heading; negative is astern.
  speed: number;
  yaw: number;
  leg: number;
  status: VesselStatus;
};
// Capsule footprint handed to the contact solver: a segment along the heading
// with a radius, moving with the vessel's velocity and yaw rate.
export type VesselObstacle = {
  id: string;
  name: string;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  yaw: number;
  halfLength: number;
  radius: number;
};
export type TrafficEvent = { type: string; message: string };
const cfg = trafficConfig.monohull;
export const initialMonohull = (): Vessel => ({
  ...cfg.start,
  speed: 0,
  yaw: 0,
  leg: 0,
  status: "moored",
});
export function vesselObstacle(v: Vessel): VesselObstacle | null {
  if (v.status === "gone") return null;
  return {
    id: cfg.id,
    name: cfg.name,
    x: v.x,
    y: v.y,
    heading: v.heading,
    vx: Math.sin(v.heading) * v.speed,
    vy: Math.cos(v.heading) * v.speed,
    yaw: v.yaw,
    halfLength: cfg.length / 2 - cfg.beam / 2,
    radius: cfg.beam / 2,
  };
}
export function startDeparture(v: Vessel): TrafficEvent[] {
  if (v.status !== "moored") return [];
  v.status = "departing";
  return [
    { type: "traffic.depart", message: `${cfg.name} departing the fuel berth` },
  ];
}
// True when any part of the player's hull is in the corridor the vessel is
// about to move through.
export function pathBlocked(v: Vessel, s: State, p: Tuning) {
  const direction = cfg.legs[v.leg]?.gear === "astern" ? -1 : 1;
  const ux = Math.sin(v.heading) * direction,
    uy = Math.cos(v.heading) * direction;
  const sn = Math.sin(s.heading),
    cs = Math.cos(s.heading);
  const reach = cfg.length / 2 + cfg.lookAhead + p.hullRadius,
    width = cfg.beam / 2 + cfg.lateralClearance + p.hullRadius;
  return hullPoints(p).some((point) => {
    const rx = s.x + point.x * cs + point.y * sn - v.x,
      ry = s.y - point.x * sn + point.y * cs - v.y;
    const along = rx * ux + ry * uy,
      across = rx * uy - ry * ux;
    return along > 0 && along < reach && Math.abs(across) < width;
  });
}
export function advanceVessel(
  v: Vessel,
  s: State,
  p: Tuning,
  dt: number,
): TrafficEvent[] {
  if (v.status === "moored" || v.status === "gone") {
    v.speed = v.yaw = 0;
    return [];
  }
  const events: TrafficEvent[] = [];
  let leg = cfg.legs[v.leg];
  let dist = Math.hypot(leg.x - v.x, leg.y - v.y);
  const arrived = leg.stop
    ? dist < cfg.arriveRadius && Math.abs(v.speed) < 0.02
    : dist < cfg.arriveRadius;
  if (arrived) {
    v.leg++;
    if (v.leg >= cfg.legs.length) {
      v.status = "gone";
      v.speed = v.yaw = 0;
      return [
        { type: "traffic.clear", message: `${cfg.name} has left the harbour` },
      ];
    }
    leg = cfg.legs[v.leg];
    dist = Math.hypot(leg.x - v.x, leg.y - v.y);
  }
  const direction = leg.gear === "astern" ? -1 : 1;
  const bearing = Math.atan2(leg.x - v.x, leg.y - v.y);
  const error = angle(bearing + (direction < 0 ? Math.PI : 0) - v.heading);
  // Rudder authority grows with speed; a little pivot avoids orbiting a
  // waypoint that sits inside the turning circle.
  const maxYaw = Math.min(
    cfg.maxYaw,
    Math.abs(v.speed) / cfg.turnRadius + cfg.pivotYaw,
  );
  const blocked = pathBlocked(v, s, p);
  // Never pivot towards a boat it is waiting for.
  v.yaw = blocked ? 0 : Math.max(-maxYaw, Math.min(maxYaw, error * 0.5));
  let target = cfg.cruiseSpeed * (0.3 + 0.7 * Math.max(0, Math.cos(error)));
  if (leg.stop)
    target =
      dist < cfg.arriveRadius
        ? 0
        : Math.min(
            target,
            Math.sqrt(2 * cfg.accel * (dist - cfg.arriveRadius)),
          );
  if (blocked !== (v.status === "yielding")) {
    v.status = blocked ? "yielding" : "departing";
    events.push(
      blocked
        ? {
            type: "traffic.yield",
            message: `${cfg.name} stopping: your boat is in its path`,
          }
        : { type: "traffic.resume", message: `${cfg.name} under way again` },
    );
  }
  target = blocked ? 0 : target * direction;
  const rate = blocked ? cfg.brake : cfg.accel;
  v.speed += Math.max(-rate * dt, Math.min(rate * dt, target - v.speed));
  v.heading += v.yaw * dt;
  v.x += Math.sin(v.heading) * v.speed * dt;
  v.y += Math.cos(v.heading) * v.speed * dt;
  return events;
}
