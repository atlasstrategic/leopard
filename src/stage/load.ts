import { stageSchema, type StageFile } from "./schema";

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
    for (const end of ["bow", "stern"] as const) {
      const bollard = bollards.get(berth.lines[end]);
      if (!bollard)
        found.push(
          `Berth ${berth.id}: ${end} bollard "${berth.lines[end]}" does not exist`,
        );
      else if (bollard.structure !== berth.structure)
        found.push(
          `Berth ${berth.id}: ${end} bollard ${bollard.id} is not on ${berth.structure}`,
        );
    }
  }
  return found;
}
function toStage(s: StageFile) {
  const scene = s.scene,
    berth = scene.berths[0];
  const bollard = (id: string) => scene.bollards.find((b) => b.id === id)!;
  const line = (end: "bow" | "stern") => ({
    bollard: berth.lines[end],
    obstacleId: berth.structure,
    anchor: { x: bollard(berth.lines[end]).x, y: bollard(berth.lines[end]).y },
  });
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
      lines: { bow: line("bow"), stern: line("stern") },
    },
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
