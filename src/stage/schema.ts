import { z } from "zod";

// Stage file format, version 1. Authoring units: metres, m/s, headings in
// degrees (true, clockwise from north) and yaw rates in rad/s; x is east and
// y is north. The loader converts headings to the engine's radians.
const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .describe("Lower-case id, unique within its list; letters, digits, hyphens");
const metres = z.number().describe("Metres");
const positive = z.number().positive();
const degrees = z.number().describe("Degrees true, clockwise from north");
const point = z.object({ x: metres, y: metres });
const pose = point.extend({ heading: degrees });
const rect = point.extend({
  width: positive.describe("East–west extent in metres"),
  length: positive.describe("North–south extent in metres"),
});

const structure = rect
  .extend({
    id,
    name: z.string(),
    kind: z
      .enum(["quay", "breakwater", "barrier"])
      .describe(
        "quay: mooring structure; breakwater: solid harbour wall; barrier: training-area limit",
      ),
  })
  .describe("Solid, axis-aligned obstacle");

const bollard = point
  .extend({
    id: z
      .string()
      .regex(/^[A-Z0-9-]+$/)
      .describe("Label shown on the quay, e.g. B01"),
    structure: id.describe("Id of the quay it stands on"),
  })
  .describe("Mooring bollard");

const envelope = rect.extend({
  heading: degrees,
  headingTolerance: positive.describe("Allowed heading error, degrees"),
  maxSpeed: positive.describe("m/s"),
  maxYawRate: positive.describe("rad/s"),
});

const berth = z
  .object({
    id,
    name: z.string(),
    side: z.literal("starboard").describe("Side of the boat against the quay"),
    structure: id.describe("Quay the boat lies against"),
    lines: z
      .object({ bow: z.string(), stern: z.string() })
      .describe("Bollard ids for the bow and stern lines"),
    approach: envelope
      .extend({
        positionTolerance: positive.describe(
          "Boat centre must be within this many metres of the approach centre",
        ),
        dwell: positive.describe("Seconds the arrival must be held"),
      })
      .describe(
        "Arrival target: the whole hull inside, held for dwell seconds",
      ),
    alongside: envelope
      .extend({
        gentleSpeed: positive.describe(
          "m/s; covered fender contact below this still counts as secured",
        ),
        boundaryAllowance: z.number().nonnegative().describe("Metres"),
      })
      .describe("Whole-hull envelope used once the first line is attached"),
  })
  .describe("Berth with its approach target, alongside envelope and lines");

const zone = z
  .object({
    id,
    name: z.string(),
    label: z.string().optional().describe("Text shown over the zone"),
    shape: z.discriminatedUnion("kind", [
      point.extend({ kind: z.literal("circle"), radius: positive }),
      rect.extend({ kind: z.literal("rect") }),
    ]),
  })
  .describe("Named area used by objectives");

const gate = point
  .extend({
    id,
    name: z.string(),
    label: z.string().optional(),
    width: positive.describe("Metres between the two lights"),
    outward: z
      .enum(["north", "east", "south", "west"])
      .describe("Direction of travel when leaving through the gate"),
  })
  .describe("Harbour entrance: a gate line between two lateral lights");

const label = point
  .extend({
    text: z.string(),
    height: positive.describe("Metres above the water"),
    width: positive.describe("Label width in metres"),
  })
  .describe("Floating sign in the scene");

const leg = point
  .extend({
    gear: z.enum(["ahead", "astern"]),
    stop: z.boolean().describe("Come to a stop at this waypoint"),
  })
  .describe("Route waypoint");

const vessel = z
  .object({
    id,
    name: z.string(),
    kind: z.literal("monohull"),
    length: positive,
    beam: positive,
    start: pose,
    cruiseSpeed: positive.describe("m/s"),
    accel: positive.describe("m/s²"),
    brake: positive.describe("m/s² when stopping for the player"),
    turnRadius: positive.describe("Metres"),
    pivotYaw: z.number().nonnegative().describe("rad/s it can turn at rest"),
    maxYaw: positive.describe("rad/s"),
    arriveRadius: positive.describe("Metres"),
    lookAhead: positive.describe("Metres ahead it keeps clear of the player"),
    lateralClearance: z.number().nonnegative().describe("Metres"),
    legs: z.array(leg).min(1),
  })
  .describe("Scripted traffic that follows its route and yields to the player");

export const stageSchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(1),
    id,
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .describe("Semantic version of this stage"),
    name: z.string(),
    description: z.string(),
    author: z.string(),
    area: z
      .string()
      .describe("Where it is set, e.g. 'Fictional training area'"),
    buoyage: z
      .enum(["IALA-A", "IALA-B"])
      .describe("Lateral light colours: A = red to port entering (Europe)"),
    scene: z.object({
      start: pose.describe("Player's starting pose"),
      structures: z.array(structure).min(1),
      bollards: z.array(bollard),
      berths: z.array(berth).min(1),
      zones: z.array(zone),
      gates: z.array(gate),
      labels: z.array(label),
    }),
    conditions: z.object({
      wind: z.object({
        speed: z.number().nonnegative().describe("m/s"),
        from: degrees.describe("Direction the wind blows from, degrees true"),
      }),
      current: z
        .object({ x: z.number(), y: z.number() })
        .describe("Water current, m/s east and north"),
    }),
    traffic: z.array(vessel),
  })
  .describe("Leopard / Handling Lab stage");
export type StageFile = z.infer<typeof stageSchema>;
