import { boat, scenario, type Tuning, type Box } from "./config";
import { resolveContacts } from "./contacts";
import { initialFenders, type Fenders } from "./fenders";
import { initialMooring, mooringForces, type Mooring } from "./mooring";
export type State = {
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  yaw: number;
  port: number;
  starboard: number;
  rudder: number;
  contact: boolean;
  impact: number;
};
export type Controls = { port: number; starboard: number; rudder: number };
export type Weather = {
  speed: number;
  direction: number;
  currentX: number;
  currentY: number;
};
export const initialState = (): State => ({
  ...scenario.start,
  vx: 0,
  vy: 0,
  yaw: 0,
  port: 0,
  starboard: 0,
  rudder: 0,
  contact: false,
  impact: 0,
});
export const initialControls = (): Controls => ({
  port: 0,
  starboard: 0,
  rudder: 0,
});
export const initialWeather = (): Weather => ({
  ...scenario.wind,
  currentX: scenario.current.x,
  currentY: scenario.current.y,
});
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export function step(
  s: State,
  c: Controls,
  w: Weather,
  dt: number,
  p: Tuning = boat,
  obstacles: Box[] = scenario.obstacles,
  fenders: Fenders = initialFenders(),
  mooring: Mooring = initialMooring(),
) {
  const sn = Math.sin(s.heading),
    cs = Math.cos(s.heading);
  const forward = { x: sn, y: cs },
    right = { x: cs, y: -sn };
  let fx = 0,
    fy = 0,
    torque = 0;
  // Local point force: x starboard, y bow. Clockwise moment = ry*Fx - rx*Fy.
  const force = (x: number, y: number, rx = 0, ry = 0) => {
    fx += x * right.x + y * forward.x;
    fy += x * right.y + y * forward.y;
    torque += ry * x - rx * y;
  };
  const response = 1 - Math.exp(-dt / p.engineLag);
  s.port += (clamp(c.port, -1, 1) - s.port) * response;
  s.starboard += (clamp(c.starboard, -1, 1) - s.starboard) * response;
  s.rudder = clamp(c.rudder, -p.maxRudder, p.maxRudder);
  const thrust = (v: number) =>
    p.maxThrust * v * (v < 0 ? p.reverseEfficiency : 1);
  force(0, thrust(s.port), -p.engineOffset, p.engineAft);
  force(0, thrust(s.starboard), p.engineOffset, p.engineAft);
  const wx = s.vx - w.currentX,
    wy = s.vy - w.currentY;
  const surge = wx * sn + wy * cs,
    sway = wx * cs - wy * sn;
  force(
    -p.lateralDrag * sway * (0.45 + Math.abs(sway)),
    -p.longitudinalDrag * surge * (0.4 + Math.abs(surge)),
  );
  torque -= p.yawDrag * s.yaw * (0.7 + Math.abs(s.yaw) * 3);
  // Stern rudders, reversing flow reverses steering; simplified, no prop wash.
  force(
    -p.rudderForce * Math.sin(s.rudder) * surge * Math.abs(surge),
    0,
    0,
    -p.length * 0.4,
  );
  const ax = Math.sin(w.direction) * w.speed - s.vx;
  const ay = Math.cos(w.direction) * w.speed - s.vy;
  const airRight = ax * cs - ay * sn,
    airForward = ax * sn + ay * cs;
  force(
    0.5 * 1.225 * p.windArea * airRight * Math.abs(airRight),
    0.5 * 1.225 * p.windArea * 0.3 * airForward * Math.abs(airForward),
    0,
    p.windLever,
  );
  const lines = mooringForces(s, mooring, dt, p);
  fx += lines.fx;
  fy += lines.fy;
  torque += lines.torque;
  s.vx += (fx / p.mass) * dt;
  s.vy += (fy / p.mass) * dt;
  s.yaw += (torque / p.inertia) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.heading += s.yaw * dt;
  s.contact = false;
  s.impact = 0;
  return resolveContacts(s, p, obstacles, fenders, dt);
}
