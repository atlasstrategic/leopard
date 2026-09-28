import { stageSchema, type StageFile } from "./schema";
import { catamaranOutline, monohullOutline, type Outline } from "../hulls";

// Engine form of a stage: SI units, radians, headings as the engine uses them.
export type Box = {
  id?: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  length: number;
  kind: "dock" | "breakwater" | "boundary";
};
// A moored boat as the contact solver sees it: a vessel that never moves.
export type MooredBoat = {
  id: string;
  name: string;
  kind: "monohull" | "catamaran";
  x: number;
  y: number;
  heading: number;
  length: number;
  beam: number;
  vx: number;
  vy: number;
  yaw: number;
  outline: Outline;
  reach: number;
};
export type Stage = ReturnType<typeof toStage>;
export class StageError extends Error {
  constructor(
    public stageId: string,
    public problems: string[],
  ) {
    super(`Stage "${stageId}" is invalid:\n- ${problems.join("\n- ")}`);
  }
}
const radians = (degrees: number) => (degrees * Math.PI) / 180;
// Quay lines each berth style uses, by the name of the boat's fitting.
const lineEnds = ["bow", "stern", "portQuarter", "starboardQuarter"] as const;
type LineEnd = (typeof lineEnds)[number];
const quayLines: Record<"alongside" | "sternTo", readonly LineEnd[]> = {
  alongside: ["bow", "stern"],
  sternTo: ["portQuarter", "starboardQuarter"],
};
const lineNames: Record<LineEnd | "lazy", string> = {
  bow: "Bow",
  stern: "Stern",
  portQuarter: "Port quarter",
  starboardQuarter: "Starboard quarter",
  lazy: "Lazy line",
};
// A berth's mooring line: from a fitting on the boat (named like the line)
// to a bollard on the quay, or, for the lazy line, to its ground chain.
export type BerthLine = {
  name: string;
  kind: "quay" | "lazy";
  // Bollard label; empty for the lazy line.
  bollard: string;
  obstacleId: string;
  anchor: { x: number; y: number };
};
const kinds = { quay: "dock", breakwater: "breakwater", barrier: "boundary" };
const outwardHeading = { north: 0, east: 90, south: 180, west: 270 };
// Checks that the schema cannot express: references and unique ids.
function problems(s: StageFile) {
  const found: string[] = [];
  const unique = (list: { id: string }[], what: string) => {
    const seen = new Set<string>();
    for (const { id } of list) {
      if (seen.has(id)) found.push(`Duplicate ${what} id "${id}"`);
      seen.add(id);
    }
  };
  const scene = s.scene;
  unique(scene.structures, "structure");
  unique(scene.bollards, "bollard");
  unique(scene.berths, "berth");
  unique(scene.zones, "zone");
  unique(scene.gates, "gate");
  unique(s.traffic, "vessel");
  unique(scene.moored ?? [], "moored boat");
  // Contacts name what was touched by id, so these share one namespace.
  const solid = new Set([
    ...scene.structures.map((b) => b.id),
    ...s.traffic.map((v) => v.id),
  ]);
  for (const m of scene.moored ?? [])
    if (solid.has(m.id))
      found.push(
        `Moored boat ${m.id}: id is already used by a structure or vessel`,
      );
  const quays = new Set(
    scene.structures.filter((b) => b.kind === "quay").map((b) => b.id),
  );
  const bollards = new Map(scene.bollards.map((b) => [b.id, b]));
  for (const b of scene.bollards)
    if (!quays.has(b.structure))
      found.push(`Bollard ${b.id}: "${b.structure}" is not a quay`);
  for (const berth of scene.berths) {
    if (!quays.has(berth.structure))
      found.push(`Berth ${berth.id}: "${berth.structure}" is not a quay`);
    const sternTo = berth.style === "sternTo",
      needs = quayLines[berth.style ?? "alongside"];
    for (const end of lineEnds) {
      const id = berth.lines[end];
      if (!needs.includes(end)) {
        if (id !== undefined)
          found.push(
            `Berth ${berth.id}: ${sternTo ? "a stern-to" : "an alongside"} berth has no ${end} line`,
          );
        continue;
      }
      const bollard = id === undefined ? undefined : bollards.get(id);
      if (id === undefined)
        found.push(`Berth ${berth.id}: needs a ${end} bollard`);
      else if (!bollard)
        found.push(`Berth ${berth.id}: ${end} bollard "${id}" does not exist`);
      else if (bollard.structure !== berth.structure)
        found.push(
          `Berth ${berth.id}: ${end} bollard ${bollard.id} is not on ${berth.structure}`,
        );
    }
    if (sternTo && !berth.lazyLine)
      found.push(`Berth ${berth.id}: a stern-to berth needs a lazyLine`);
    if (!sternTo && berth.lazyLine)
      found.push(`Berth ${berth.id}: only a stern-to berth has a lazyLine`);
  }
  const mission = s.mission,
    stepIds = mission.steps.map((st) => st.id);
  unique(mission.steps, "step");
  const zones = new Map(scene.zones.map((z) => [z.id, z]));
  const gates = new Set(scene.gates.map((g) => g.id));
  const vessels = new Set(s.traffic.map((v) => v.id));
  const needZone = (where: string, zone: string) => {
    if (!zones.has(zone)) found.push(`${where}: zone "${zone}" does not exist`);
  };
  const needVessel = (where: string, vessel: string) => {
    if (!vessels.has(vessel))
      found.push(`${where}: vessel "${vessel}" does not exist`);
  };
  if (!scene.berths.some((b) => b.id === mission.berth))
    found.push(`Mission: berth "${mission.berth}" does not exist`);
  mission.steps.forEach((st, i) => {
    const where = `Step ${st.id}`;
    for (const zone of st.show ?? []) needZone(where, zone);
    if (st.bearing?.zone) needZone(where, st.bearing.zone);
    if (st.bearing?.gate && !gates.has(st.bearing.gate))
      found.push(`${where}: gate "${st.bearing.gate}" does not exist`);
    const previous = mission.steps[i - 1];
    if (st.kind === "holdInZone") {
      needZone(where, st.zone);
      for (const v of st.releases) needVessel(where, v);
    } else if (st.kind === "waitForClear") {
      needZone(where, st.zone);
      needVessel(where, st.vessel);
      if (zones.get(st.zone)?.shape.kind === "circle")
        found.push(`${where}: zone "${st.zone}" must be a rectangle`);
    } else if (st.kind === "secureAlongside") {
      if (previous?.kind !== "arriveAtBerth")
        found.push(`${where}: must directly follow an arriveAtBerth step`);
    } else if (st.kind === "checklist") {
      unique(st.items, `${where} item`);
      if (
        st.requiresSecured &&
        !mission.steps.slice(0, i).some((p) => p.kind === "secureAlongside")
      )
        found.push(
          `${where}: requiresSecured needs an earlier secureAlongside step`,
        );
      for (const it of st.items)
        if (
          it.action === "choice" &&
          it.options.filter((o) => !o.refusal).length !== 1
        )
          found.push(
            `${where}: choice ${it.id} needs exactly one option without a refusal`,
          );
    } else if (st.kind === "exitThroughGate" && !gates.has(st.gate))
      found.push(`${where}: gate "${st.gate}" does not exist`);
  });
  for (const rule of mission.rules) {
    if (rule.kind === "keepOut") {
      needZone("keepOut rule", rule.zone);
      if (!stepIds.includes(rule.until))
        found.push(`keepOut rule: step "${rule.until}" does not exist`);
    } else needVessel("protectedContact rule", rule.vessel);
  }
  return found;
}
// Engine defaults for anything a stage's scoring leaves out.
export const defaultScoring = {
  weights: { impact: 0.4, control: 0.25, procedure: 0.2, smoothness: 0.15 },
  impact: { perContact: 25, trafficClearance: 3, trafficDeduction: 30 },
  control: {
    arrivalRadius: 12,
    arrivalGood: 0.3,
    arrivalPoor: 0.8,
    arrivalDeduction: 50,
    perCountdownReset: 10,
    perEarlyEntry: 25,
    wrongSide: 30,
  },
  procedure: {
    fendersLate: 30,
    perChecklistRefusal: 10,
    perLineRefusal: 5,
    perReleaseUnderLoad: 10,
  },
  smoothness: {
    parTime: 300,
    slowTime: 600,
    slowTimeScore: 40,
    leverPar: 60,
    timeShare: 0.6,
  },
  ratings: [
    { min: 90, label: "Excellent" },
    { min: 75, label: "Good" },
    { min: 60, label: "Fair" },
    { min: 0, label: "Needs practice" },
  ],
  tips: {
    contacts:
      "You had {count}. Slow down earlier near quays and breakwaters, and have fenders out before you get close.",
    trafficClearance:
      "You came within {gap} m of the {vessel}. Give moving traffic at least {clearance} m.",
    arrivalSpeed:
      "Your speed near the berth peaked at {kn} kn. Brake earlier with short, equal reverse bursts so you arrive below {target} kn.",
    countdownResets:
      "You drifted out of the holding zone {count}×. Hold position with small, early lever corrections.",
    earlyEntries:
      "You entered a zone before you were cleared. Wait for the radio call.",
    wrongSide:
      "You left on the wrong side of the channel. Keep to the starboard side of a channel.",
    fendersLate:
      "Your fenders were not out when you arrived. Deploy them during the approach: the crew needs 3 seconds.",
    checklistRefusals: "{count} {verb} refused. Follow the checklist in order.",
    lineRefusals:
      "{count} {verb} refused. Read the reason (reach, speed, neutral, fenders) before trying again.",
    releaseUnderLoad:
      "You let go a line under high load. Ease the boat to take the load off before releasing.",
    time: "The mission took {minutes} minutes. Prepare while you wait, so you are ready when cleared.",
    levers:
      "You made {count} lever changes. Fewer, earlier corrections are smoother and easier on the engines.",
    clean:
      "A clean run. Try it again with stronger wind in Handling & weather.",
    failed:
      "{failure}. Deploy fenders before you get near other boats, and hold the roving fender at a bow or quarter that may touch.",
  },
};
export type Scoring = typeof defaultScoring;
function scoring(s: StageFile["mission"]["scoring"]): Scoring {
  const d = defaultScoring;
  return {
    weights: s?.weights ?? d.weights,
    impact: { ...d.impact, ...s?.impact },
    control: { ...d.control, ...s?.control },
    procedure: { ...d.procedure, ...s?.procedure },
    smoothness: { ...d.smoothness, ...s?.smoothness },
    ratings: [...(s?.ratings ?? d.ratings)].sort((a, b) => b.min - a.min),
    tips: { ...d.tips, ...s?.tips },
  };
}
export type Step = StageFile["mission"]["steps"][number];
export type Rule = StageFile["mission"]["rules"][number];
export type Face = "west" | "east" | "south" | "north";
// The quay face a berth lies against: the side facing its alongside envelope.
function quayFace(
  quay: { x: number; y: number; width: number; length: number },
  envelope: { x: number; y: number },
): Face {
  const dx = (envelope.x - quay.x) / (quay.width / 2),
    dy = (envelope.y - quay.y) / (quay.length / 2);
  return Math.abs(dx) >= Math.abs(dy)
    ? dx < 0
      ? "west"
      : "east"
    : dy < 0
      ? "south"
      : "north";
}
function toStage(s: StageFile) {
  const scene = s.scene,
    berth = scene.berths.find((b) => b.id === s.mission.berth)!;
  const bollard = (id: string) => scene.bollards.find((b) => b.id === id)!;
  const style = berth.style ?? "alongside";
  const lines: Record<string, BerthLine> = Object.fromEntries(
    quayLines[style].map((end) => {
      const b = bollard(berth.lines[end]!);
      return [
        end,
        {
          name: lineNames[end],
          kind: "quay",
          bollard: b.id,
          obstacleId: berth.structure,
          anchor: { x: b.x, y: b.y },
        },
      ];
    }),
  );
  if (berth.lazyLine)
    lines.lazy = {
      name: lineNames.lazy,
      kind: "lazy",
      bollard: "",
      obstacleId: "",
      anchor: { x: berth.lazyLine.x, y: berth.lazyLine.y },
    };
  const xs = scene.structures.flatMap((b) => [
      b.x - b.width / 2,
      b.x + b.width / 2,
    ]),
    ys = scene.structures.flatMap((b) => [
      b.y - b.length / 2,
      b.y + b.length / 2,
    ]);
  return {
    file: s,
    id: s.id,
    version: s.version,
    name: s.name,
    area: s.area,
    start: { ...scene.start, heading: radians(scene.start.heading) },
    // Structure order is kept: the contact solver resolves obstacles in order.
    obstacles: scene.structures.map((b): Box => ({
      id: b.id,
      name: b.name,
      x: b.x,
      y: b.y,
      width: b.width,
      length: b.length,
      kind: kinds[b.kind] as Box["kind"],
    })),
    bounds: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    },
    berth: {
      id: berth.id,
      name: berth.name,
      face: quayFace(
        scene.structures.find((b) => b.id === berth.structure)!,
        berth.alongside,
      ),
      label: berth.label ?? "",
      approach: {
        x: berth.approach.x,
        y: berth.approach.y,
        heading: radians(berth.approach.heading),
        width: berth.approach.width,
        length: berth.approach.length,
        positionTolerance: berth.approach.positionTolerance,
        headingTolerance: radians(berth.approach.headingTolerance),
        maxSpeed: berth.approach.maxSpeed,
        maxYaw: berth.approach.maxYawRate,
        dwell: berth.approach.dwell,
      },
      alongside: {
        x: berth.alongside.x,
        y: berth.alongside.y,
        width: berth.alongside.width,
        length: berth.alongside.length,
        heading: radians(berth.alongside.heading),
        headingTolerance: radians(berth.alongside.headingTolerance),
        maxSpeed: berth.alongside.maxSpeed,
        maxYaw: berth.alongside.maxYawRate,
        obstacleId: berth.structure,
        gentleSpeed: berth.alongside.gentleSpeed,
        boundaryAllowance: berth.alongside.boundaryAllowance,
      },
      style,
      lines,
    },
    moored: (scene.moored ?? []).map((m): MooredBoat => {
      const outline =
        m.kind === "monohull"
          ? monohullOutline(m.length, m.beam)
          : catamaranOutline(m.length, m.beam);
      return {
        ...m,
        heading: radians(m.heading),
        vx: 0,
        vy: 0,
        yaw: 0,
        outline,
        reach: Math.max(...outline.map(([x, y]) => Math.hypot(x, y))),
      };
    }),
    zones: Object.fromEntries(scene.zones.map((z) => [z.id, z])),
    gates: Object.fromEntries(
      scene.gates.map((g) => {
        const heading = radians(outwardHeading[g.outward]);
        // Starboard when leaving; IALA A puts red on this side (port when entering).
        const right = { x: Math.cos(heading), y: -Math.sin(heading) };
        const half = g.width / 2,
          redRight = s.buoyage === "IALA-A";
        const side = (sign: number) => ({
          x: g.x + right.x * half * sign,
          y: g.y + right.y * half * sign,
        });
        return [
          g.id,
          {
            ...g,
            heading,
            red: side(redRight ? 1 : -1),
            green: side(redRight ? -1 : 1),
          },
        ];
      }),
    ),
    labels: scene.labels,
    // The engine stores the direction the wind blows towards.
    wind: {
      speed: s.conditions.wind.speed,
      direction: radians((s.conditions.wind.from + 180) % 360),
    },
    current: { ...s.conditions.current },
    traffic: s.traffic.map((v) => ({
      ...v,
      start: { ...v.start, heading: radians(v.start.heading) },
    })),
    mission: {
      ...s.mission,
      scoring: scoring(s.mission.scoring),
    },
  };
}
// Validate a stage file (schema, then references) and convert it for the engine.
export function parseStage(data: unknown): Stage {
  const parsed = stageSchema.safeParse(data);
  const id =
    typeof data === "object" && data && "id" in data
      ? String((data as { id: unknown }).id)
      : "unknown";
  if (!parsed.success)
    throw new StageError(
      id,
      parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    );
  const found = problems(parsed.data);
  if (found.length) throw new StageError(id, found);
  return toStage(parsed.data);
}
