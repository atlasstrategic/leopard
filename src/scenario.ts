import { angle, boat, scenario } from "./config";
import type { State } from "./simulation";
export type Progress = {
  elapsed: number;
  dwell: number;
  success: boolean;
  collisions: number;
  penalty: number;
  contactCooldown: number;
};
export const initialProgress = (): Progress => ({
  elapsed: 0,
  dwell: 0,
  success: false,
  collisions: 0,
  penalty: 0,
  contactCooldown: 0,
});
export function requirements(s: State) {
  const t = scenario.target,
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
      Math.hypot(dx, dy) <= t.positionTolerance &&
      Math.abs(localX) + extentX <= t.width / 2 &&
      Math.abs(localY) + extentY <= t.length / 2,
    heading: Math.abs(a) <= t.headingTolerance,
    speed: Math.hypot(s.vx, s.vy) <= t.maxSpeed && Math.abs(s.yaw) <= t.maxYaw,
    clear: !s.contact,
  };
}
export function updateProgress(p: Progress, s: State, dt: number) {
  if (p.success) return;
  p.elapsed += dt;
  p.contactCooldown = Math.max(0, p.contactCooldown - dt);
  if (s.contact) {
    if (s.impact > 0.08 && p.contactCooldown === 0) {
      p.collisions++;
      p.penalty += scenario.collisionPenalty;
    }
    p.contactCooldown = 1;
  }
  const r = requirements(s);
  p.dwell = Object.values(r).every(Boolean) ? p.dwell + dt : 0;
  if (p.dwell + 1e-8 >= scenario.target.dwell) {
    p.success = true;
    p.dwell = scenario.target.dwell;
  }
}
