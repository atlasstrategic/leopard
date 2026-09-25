import { angle, boat, scenario, mooringConfig } from "./config";
import type { State } from "./simulation";
import type { ContactSample } from "./contacts";
export type PositionTarget = "approach" | "alongside";
export function contactAcceptable(s: State, samples: ContactSample[]) {
  if (!s.contact) return true;
  return (
    samples.length > 0 &&
    samples.every(
      (c) =>
        c.obstacleId === scenario.alongside.obstacleId &&
        c.covered &&
        !c.hullContact &&
        c.speed <= scenario.alongside.gentleSpeed,
    )
  );
}
export const positioningTarget = (mode: PositionTarget) =>
  mode === "alongside" ? scenario.alongside : scenario.target;
export type Progress = {
  elapsed: number;
  phase: "approach" | "securing" | "secured";
  positionTarget: PositionTarget;
  arrivalAt: number | null;
  securedAt: number | null;
  dwell: number;
  success: boolean;
  collisions: number;
  penalty: number;
};
export const initialProgress = (): Progress => ({
  elapsed: 0,
  phase: "approach",
  positionTarget: "approach",
  arrivalAt: null,
  securedAt: null,
  dwell: 0,
  success: false,
  collisions: 0,
  penalty: 0,
});
export function requirements(
  s: State,
  mode: PositionTarget = "approach",
  acceptableContact = false,
) {
  const t = positioningTarget(mode),
    a = angle(s.heading - t.heading);
  const dx = s.x - t.x,
    dy = s.y - t.y;
  const localX = dx * Math.cos(t.heading) - dy * Math.sin(t.heading);
  const localY = dx * Math.sin(t.heading) + dy * Math.cos(t.heading);
  const extentX =
    (Math.abs(Math.cos(a)) * boat.beam) / 2 +
    (Math.abs(Math.sin(a)) * boat.length) / 2;
  const extentY =
    (Math.abs(Math.sin(a)) * boat.beam) / 2 +
    (Math.abs(Math.cos(a)) * boat.length) / 2;
  return {
    position:
      (mode === "alongside" ||
        Math.hypot(dx, dy) <= scenario.target.positionTolerance) &&
      Math.abs(localX) + extentX <=
        t.width / 2 +
          (mode === "alongside" ? scenario.alongside.boundaryAllowance : 0) &&
      Math.abs(localY) + extentY <= t.length / 2,
    heading: Math.abs(a) <= t.headingTolerance,
    speed: Math.hypot(s.vx, s.vy) <= t.maxSpeed && Math.abs(s.yaw) <= t.maxYaw,
    clear: !s.contact || (mode === "alongside" && acceptableContact),
  };
}
export function updateProgress(
  p: Progress,
  s: State,
  dt: number,
  readyToSecure = false,
  acceptableContact = false,
) {
  p.elapsed += dt;
  const inBerth = Object.values(
    requirements(s, p.positionTarget, acceptableContact),
  ).every(Boolean);
  if (p.phase === "approach") {
    p.dwell = inBerth ? p.dwell + dt : 0;
    if (p.dwell + 1e-8 >= scenario.target.dwell) {
      p.phase = "securing";
      p.arrivalAt = p.elapsed;
      p.dwell = 0;
    }
    return;
  }
  // Secured is a LIVE state, not a frozen success screen. Losing a prerequisite
  // (including release/break, thrust, position or speed) revokes it immediately.
  if (!inBerth || !readyToSecure || p.positionTarget !== "alongside") {
    p.phase = "securing";
    p.success = false;
    p.dwell = 0;
    return;
  }
  p.dwell = Math.min(mooringConfig.securedDwell, p.dwell + dt);
  if (p.dwell + 1e-8 >= mooringConfig.securedDwell) {
    p.phase = "secured";
    p.success = true;
    p.securedAt ??= p.elapsed;
  }
}
