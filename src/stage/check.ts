import { boat, mooringConfig, STEP, trafficConfig, useStage } from "../config";
import { hullPoints } from "../contacts";
import { attachmentCheck, lineIds } from "../mooring";
import { requirements } from "../scenario";
import { initialState, type State } from "../simulation";
import {
  advanceVessel,
  initialMonohull,
  startDeparture,
  vesselObstacle,
} from "../traffic";
import type { Box, Stage } from "./load";

// Geometry checks for a stage that already passed the schema and reference
// checks: does the scene actually work for the boat? Uses the engine's own
// collision and mooring code. Errors make a stage unplayable; warnings are
// probably mistakes.
export type CheckResult = { errors: string[]; warnings: string[] };
const cell = 1;
// Clearance from structures that the reachability map requires: the boat's
// half-beam plus a small margin, so a gap must be wider than the boat.
const reachClearance = boat.beam / 2 + 0.3;
// Gap between the hull and the quay face for the alongside pose.
const alongsideGap = 1;

export const pose = (x: number, y: number, heading: number): State => ({
  ...initialState(),
  x,
  y,
  heading,
});
function distanceToBox(b: Box, x: number, y: number) {
  const dx = Math.max(Math.abs(x - b.x) - b.width / 2, 0),
    dy = Math.max(Math.abs(y - b.y) - b.length / 2, 0);
  return Math.hypot(dx, dy);
}
const inside = (b: Box, x: number, y: number) =>
  Math.abs(x - b.x) <= b.width / 2 && Math.abs(y - b.y) <= b.length / 2;
// Smallest gap between the boat's hull and any structure (negative: overlap).
export function hullClearance(stage: Stage, s: State) {
  const sn = Math.sin(s.heading),
    cs = Math.cos(s.heading);
  let min = Infinity;
  for (const p of hullPoints(boat)) {
    const x = s.x + p.x * cs + p.y * sn,
      y = s.y - p.x * sn + p.y * cs;
    for (const b of stage.obstacles)
      min = Math.min(
        min,
        inside(b, x, y)
          ? -boat.hullRadius
          : distanceToBox(b, x, y) - boat.hullRadius,
      );
  }
  return min;
}
// Where the boat lies alongside: heading of the envelope, starboard side
// alongsideGap metres off the berth's quay face, centred along the envelope.
export function alongsidePose(stage: Stage): State {
  const b = stage.berth,
    a = b.alongside,
    quay = stage.obstacles.find((o) => o.id === a.obstacleId)!,
    off = boat.beam / 2 + alongsideGap;
  switch (b.face) {
    case "west":
      return pose(quay.x - quay.width / 2 - off, a.y, a.heading);
    case "east":
      return pose(quay.x + quay.width / 2 + off, a.y, a.heading);
    case "south":
      return pose(a.x, quay.y - quay.length / 2 - off, a.heading);
    case "north":
      return pose(a.x, quay.y + quay.length / 2 + off, a.heading);
  }
}
// Water the boat can reach from the start, on a 1 m grid.
function reachable(stage: Stage) {
  const { minX, maxX, minY, maxY } = stage.bounds;
  const nx = Math.ceil((maxX - minX) / cell) + 1,
    ny = Math.ceil((maxY - minY) / cell) + 1;
  const free = (i: number, j: number) => {
    const x = minX + i * cell,
      y = minY + j * cell;
    return stage.obstacles.every(
      (b) => !inside(b, x, y) && distanceToBox(b, x, y) >= reachClearance,
    );
  };
  const seen = new Uint8Array(nx * ny);
  const index = (x: number, y: number) => {
    const i = Math.round((x - minX) / cell),
      j = Math.round((y - minY) / cell);
    return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
  };
  const start = index(stage.start.x, stage.start.y);
  const queue =
    start >= 0 && free(start % nx, Math.floor(start / nx)) ? [start] : [];
  for (const k of queue) seen[k] = 1;
  while (queue.length) {
    const k = queue.pop()!,
      i = k % nx,
      j = Math.floor(k / nx);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di,
        c = j + dj,
        next = c * nx + a;
      if (a < 0 || c < 0 || a >= nx || c >= ny || seen[next] || !free(a, c))
        continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  // Nearest reachable cell within a couple of metres counts: targets may sit
  // closer to a quay than the grid's clearance.
  return (x: number, y: number) => {
    for (let r = 0; r <= 3; r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++) {
          const k = index(x + dx * cell, y + dy * cell);
          if (k >= 0 && seen[k]) return true;
        }
    return false;
  };
}
// Simulate the traffic vessel's route on its own: it must stay clear of
// structures and leave within the time limit.
function trafficRoute(stage: Stage, found: CheckResult) {
  const cfg = trafficConfig.monohull;
  if (!cfg) return;
  const v = initialMonohull();
  startDeparture(v);
  // The player is parked far away so the vessel never stops for it.
  const away = pose(1e5, 1e5, 0);
  let closest = Infinity,
    time = 0;
  for (; time < 600 && v.status !== "gone"; time += STEP) {
    const o = vesselObstacle(v);
    if (o) {
      const ax = Math.sin(o.heading),
        ay = Math.cos(o.heading);
      for (let t = -o.halfLength; t <= o.halfLength; t += 0.5)
        for (const b of stage.obstacles)
          closest = Math.min(
            closest,
            distanceToBox(b, o.x + ax * t, o.y + ay * t) - o.radius,
          );
    }
    advanceVessel(v, away, boat, STEP);
  }
  if (v.status !== "gone")
    found.errors.push(
      `Traffic ${cfg.id}: route not finished after 600 s (stuck at leg ${v.leg + 1} of ${cfg.legs.length}; check waypoint spacing and turnRadius)`,
    );
  if (closest < 0)
    found.errors.push(
      `Traffic ${cfg.id}: route passes through a structure (${closest.toFixed(2)} m)`,
    );
  else if (closest < 0.3)
    found.warnings.push(
      `Traffic ${cfg.id}: route passes within ${closest.toFixed(2)} m of a structure`,
    );
}
export function checkStage(stage: Stage): CheckResult {
  useStage(stage);
  const found: CheckResult = { errors: [], warnings: [] };
  const start = pose(stage.start.x, stage.start.y, stage.start.heading);
  if (hullClearance(stage, start) < 0)
    found.errors.push("Start: the boat overlaps a structure");
  // Berth: the approach target and alongside pose must fit the boat.
  const t = stage.berth.approach,
    approach = pose(t.x, t.y, t.heading);
  if (!requirements(approach, "approach", true).position)
    found.errors.push(
      "Berth approach: the boat does not fit inside the approach target at its centre",
    );
  if (hullClearance(stage, approach) < 0)
    found.errors.push("Berth approach: the target overlaps a structure");
  const alongside = alongsidePose(stage);
  const right = {
    x: Math.cos(alongside.heading),
    y: -Math.sin(alongside.heading),
  };
  const quay = stage.obstacles.find(
    (o) => o.id === stage.berth.alongside.obstacleId,
  )!;
  if (right.x * (quay.x - alongside.x) + right.y * (quay.y - alongside.y) <= 0)
    found.errors.push(
      "Berth alongside: the heading puts the port side against the quay (berths are starboard side to)",
    );
  else {
    if (!requirements(alongside, "alongside", true).position)
      found.errors.push(
        `Berth alongside: the boat, ${alongsideGap} m off the ${stage.berth.face} face, is not inside the alongside envelope`,
      );
    if (hullClearance(stage, alongside) < 0)
      found.errors.push("Berth alongside: the boat overlaps another structure");
    for (const id of lineIds) {
      const check = attachmentCheck(alongside, id, stage.obstacles, true);
      if (!check.ok)
        found.errors.push(
          `Berth alongside: ${id} line to ${mooringConfig.lines[id].bollard} cannot be attached (${check.reason})`,
        );
    }
  }
  // Zones the boat must hold in need to be clear of structures; others (such
  // as a keep-out lane up to a quay) may overlap them.
  const holds = new Set(
    stage.file.mission.steps.flatMap((st) =>
      st.kind === "holdInZone" ? [st.zone] : [],
    ),
  );
  for (const id of holds) {
    const s = stage.zones[id].shape;
    const overlaps = stage.obstacles.some((b) =>
      s.kind === "circle"
        ? inside(b, s.x, s.y) || distanceToBox(b, s.x, s.y) < s.radius
        : Math.abs(s.x - b.x) < (s.width + b.width) / 2 &&
          Math.abs(s.y - b.y) < (s.length + b.length) / 2,
    );
    if (overlaps)
      found.warnings.push(
        `Zone ${id}: the boat holds here, but it overlaps a structure`,
      );
  }
  // Reachability from the start.
  const canReach = reachable(stage);
  const targets: [string, number, number][] = [
    ["the berth approach target", t.x, t.y],
    ["the alongside position", alongside.x, alongside.y],
    ...Object.values(stage.zones).map((z): [string, number, number] => [
      `zone ${z.id}`,
      z.shape.x,
      z.shape.y,
    ]),
    ...Object.values(stage.gates).flatMap((g): [string, number, number][] => {
      const out = { x: Math.sin(g.heading), y: Math.cos(g.heading) };
      return [
        [`gate ${g.id} (inside)`, g.x - out.x * 6, g.y - out.y * 6],
        [`gate ${g.id} (outside)`, g.x + out.x * 6, g.y + out.y * 6],
      ];
    }),
  ];
  for (const [name, x, y] of targets)
    if (!canReach(x, y))
      found.errors.push(
        `Reachability: ${name} cannot be reached from the start by a boat ${boat.beam} m wide`,
      );
  trafficRoute(stage, found);
  return found;
}
