import { boat, mooringConfig, STEP, trafficConfig, useStage } from "../config";
import { hullPoints } from "../contacts";
import { attachmentCheck, lineGeometry, lineIds } from "../mooring";
import { requirements } from "../scenario";
import { initialState, type State } from "../simulation";
import {
  advanceVessel,
  initialMonohull,
  startDeparture,
  vesselObstacle,
} from "../traffic";
import type { Box, MooredBoat, Stage } from "./load";
import { gateCrossing, vesselInZone, type ZoneShape } from "../mission";
import { outlineDistance, outlineWorld, toLocal } from "../hulls";

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
// Signed distance from a point to a moored boat's outline (negative inside).
const distanceToBoat = (m: MooredBoat, x: number, y: number) => {
  const l = toLocal(m, x, y);
  return outlineDistance(m.outline, l.x, l.y).distance;
};
// Smallest gap between the boat's hull and any structure or moored boat
// (negative: overlap).
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
    for (const m of stage.moored)
      min = Math.min(min, distanceToBoat(m, x, y) - boat.hullRadius);
  }
  return min;
}
// Where the boat lies at the berth: heading of the envelope, centred along
// it, alongsideGap metres off the berth's quay face with its starboard side
// (alongside) or its stern (stern-to).
export function berthPose(stage: Stage): State {
  const b = stage.berth,
    a = b.alongside,
    quay = stage.obstacles.find((o) => o.id === a.obstacleId)!,
    off = (b.style === "sternTo" ? boat.length : boat.beam) / 2 + alongsideGap;
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
// Whether two zone shapes overlap (both test the boat's centre).
function overlap(a: ZoneShape, b: ZoneShape): boolean {
  if (a.kind === "circle" && b.kind === "circle")
    return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
  if (a.kind === "rect" && b.kind === "rect")
    return (
      Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
      Math.abs(a.y - b.y) < (a.length + b.length) / 2
    );
  const [c, r] =
    a.kind === "circle"
      ? [a, b as Extract<ZoneShape, { kind: "rect" }>]
      : [b as Extract<ZoneShape, { kind: "circle" }>, a];
  if (c.kind !== "circle" || r.kind !== "rect") return false;
  const dx = Math.max(Math.abs(c.x - r.x) - r.width / 2, 0),
    dy = Math.max(Math.abs(c.y - r.y) - r.length / 2, 0);
  return Math.hypot(dx, dy) < c.radius;
}
// Water the boat can reach from the start, on a 1 m grid.
function reachable(stage: Stage) {
  const { minX, maxX, minY, maxY } = stage.bounds;
  const nx = Math.ceil((maxX - minX) / cell) + 1,
    ny = Math.ceil((maxY - minY) / cell) + 1;
  const free = (i: number, j: number) => {
    const x = minX + i * cell,
      y = minY + j * cell;
    return (
      stage.obstacles.every(
        (b) => !inside(b, x, y) && distanceToBox(b, x, y) >= reachClearance,
      ) && stage.moored.every((m) => distanceToBoat(m, x, y) >= reachClearance)
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
  // The closest pass, and what, where and when it was.
  let closest = Infinity,
    what = "",
    leg = 0,
    at = 0,
    time = 0;
  const near = (gap: number, name: string) => {
    if (gap >= closest) return;
    closest = gap;
    what = name;
    leg = v.leg;
    at = time;
  };
  const wrongSide = new Set<string>();
  for (; time < 600 && v.status !== "gone"; time += STEP) {
    const before = { ...v };
    const o = vesselObstacle(v);
    if (o)
      for (const p of outlineWorld(o, 0.5)) {
        for (const b of stage.obstacles)
          near(
            inside(b, p.x, p.y) ? -0.01 : distanceToBox(b, p.x, p.y),
            b.name ?? b.id ?? b.kind,
          );
        for (const m of stage.moored) near(distanceToBoat(m, p.x, p.y), m.name);
      }
    advanceVessel(v, away, boat, STEP);
    for (const [id, gate] of Object.entries(stage.gates))
      if (
        gateCrossing(
          gate,
          before as unknown as State,
          v as unknown as State,
        ) === "port"
      )
        wrongSide.add(id);
  }
  for (const id of wrongSide)
    found.warnings.push(
      `Traffic ${cfg.id}: leaves through gate ${id} on the port side of the channel (keep to starboard going out)`,
    );
  const where = `${what}, on leg ${leg + 1} of ${cfg.legs.length} at ${at.toFixed(0)} s`;
  if (v.status !== "gone")
    found.errors.push(
      `Traffic ${cfg.id}: route not finished after 600 s (stuck at leg ${v.leg + 1} of ${cfg.legs.length}; check waypoint spacing and turnRadius)`,
    );
  if (closest < 0)
    found.errors.push(
      `Traffic ${cfg.id}: route passes through a structure or moored boat (${where})`,
    );
  else if (closest < 0.3)
    found.warnings.push(
      `Traffic ${cfg.id}: route passes within ${closest.toFixed(2)} m of a structure or moored boat (${where})`,
    );
}
export function checkStage(stage: Stage): CheckResult {
  useStage(stage);
  const found: CheckResult = { errors: [], warnings: [] };
  const start = pose(stage.start.x, stage.start.y, stage.start.heading);
  if (hullClearance(stage, start) < 0)
    found.errors.push("Start: the boat overlaps a structure or moored boat");
  // Berth: the approach target and alongside pose must fit the boat.
  const t = stage.berth.approach,
    approach = pose(t.x, t.y, t.heading);
  if (!requirements(approach, "approach", true).position)
    found.errors.push(
      "Berth approach: the boat does not fit inside the approach target at its centre",
    );
  if (hullClearance(stage, approach) < 0)
    found.errors.push(
      "Berth approach: the target overlaps a structure or moored boat",
    );
  const alongside = berthPose(stage),
    sternTo = stage.berth.style === "sternTo",
    what = sternTo ? "Berth (stern-to)" : "Berth alongside";
  const right = {
      x: Math.cos(alongside.heading),
      y: -Math.sin(alongside.heading),
    },
    ahead = { x: Math.sin(alongside.heading), y: Math.cos(alongside.heading) };
  const quay = stage.obstacles.find(
    (o) => o.id === stage.berth.alongside.obstacleId,
  )!;
  const toQuay = { x: quay.x - alongside.x, y: quay.y - alongside.y };
  // Stern-to, the quay lies astern (within 30° of dead astern, face-on).
  const astern = {
    west: { x: 1, y: 0 },
    east: { x: -1, y: 0 },
    south: { x: 0, y: 1 },
    north: { x: 0, y: -1 },
  }[stage.berth.face];
  if (
    sternTo &&
    -(ahead.x * astern.x + ahead.y * astern.y) < Math.cos(Math.PI / 6)
  )
    found.errors.push(
      `${what}: the heading must point the bow away from the ${stage.berth.face} face of the quay`,
    );
  else if (!sternTo && right.x * toQuay.x + right.y * toQuay.y <= 0)
    found.errors.push(
      "Berth alongside: the heading puts the port side against the quay (berths are starboard side to)",
    );
  else {
    if (!requirements(alongside, "alongside", true).position)
      found.errors.push(
        `${what}: the boat, ${alongsideGap} m off the ${stage.berth.face} face, is not inside the ${sternTo ? "berth" : "alongside"} envelope`,
      );
    if (hullClearance(stage, alongside) < 0)
      found.errors.push(
        `${what}: the boat overlaps another structure or a moored boat`,
      );
    // The lazy line is picked up at the quay, so only quay lines have a
    // reach to check.
    for (const id of lineIds()) {
      const def = mooringConfig.lines[id];
      if (def.kind !== "quay") continue;
      const check = attachmentCheck(alongside, id, stage.obstacles, true);
      if (!check.ok)
        found.errors.push(
          `${what}: ${id} line to ${def.bollard} cannot be attached (${check.reason})`,
        );
    }
    const lazy = mooringConfig.lines.lazy;
    if (lazy) {
      // The ground chain lies off the berth, ahead of the moored boat.
      const bow = lineGeometry(alongside, "lazy");
      const along =
        (lazy.anchor.x - alongside.x) * ahead.x +
        (lazy.anchor.y - alongside.y) * ahead.y;
      const inside = [
        ...stage.obstacles
          .filter((o) => distanceToBox(o, lazy.anchor.x, lazy.anchor.y) === 0)
          .map((o) => o.name ?? o.id ?? o.kind),
        ...stage.moored
          .filter((m) => distanceToBoat(m, lazy.anchor.x, lazy.anchor.y) < 0)
          .map((m) => m.name),
      ];
      if (inside.length)
        found.errors.push(
          `${what}: the lazyLine lies inside ${inside[0]}; put it in open water`,
        );
      else if (along < boat.length / 2 + 2)
        found.errors.push(
          `${what}: the lazyLine must lie ahead of the moored boat's bow, off the berth`,
        );
      else if (bow.distance > mooringConfig.tending.lazyMaxLength)
        found.errors.push(
          `${what}: the lazyLine is ${bow.distance.toFixed(1)} m from the bow, beyond the ${mooringConfig.tending.lazyMaxLength} m the crew can pay out`,
        );
    }
  }
  // Moored boats must lie clear of structures and of each other.
  stage.moored.forEach((m, i) => {
    const points = outlineWorld(m, 0.5);
    const hit =
      stage.obstacles.find((b) => points.some((p) => inside(b, p.x, p.y)))
        ?.name ??
      stage.moored
        .slice(i + 1)
        .find((other) =>
          points.some((p) => distanceToBoat(other, p.x, p.y) < 0),
        )?.name;
    if (hit) found.errors.push(`Moored boat ${m.id}: overlaps ${hit}`);
  });
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
  // A wait for a vessel that is not in its zone when the wait starts ends at
  // once. Traffic waits at its start until released, so check the start.
  const steps = stage.file.mission.steps;
  if (trafficConfig.monohull)
    for (const st of steps) {
      if (st.kind !== "waitForClear") continue;
      const start = vesselObstacle(initialMonohull());
      if (start && !vesselInZone(start, stage.zones[st.zone].shape))
        found.warnings.push(
          `Step ${st.id}: ${st.vessel} starts outside zone ${st.zone}, so the wait ends as soon as the step starts`,
        );
    }
  // A keep-out zone overlapping a zone the player must hold in, while the
  // rule applies, costs a penalty for doing what the stage asks.
  for (const rule of stage.file.mission.rules) {
    if (rule.kind !== "keepOut") continue;
    const until = steps.findIndex((st) => st.id === rule.until);
    steps.forEach((st, i) => {
      if (
        st.kind === "holdInZone" &&
        i <= until &&
        overlap(stage.zones[rule.zone].shape, stage.zones[st.zone].shape)
      )
        found.warnings.push(
          `keepOut ${rule.zone}: overlaps zone ${st.zone}, where step ${st.id} holds before the rule ends at ${rule.until}`,
        );
    });
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
