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
    label: z
      .string()
      .optional()
      .describe("Short code for the instruments' bearing caption, e.g. 01"),
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
    kind: z
      .literal("monohull")
      .describe(
        "A modern plumb-bowed cruising monohull, drawn and colliding with the same deck-edge outline, scaled to length and beam",
      ),
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
    radio: z
      .object({
        yield: z
          .string()
          .optional()
          .describe("Announced when it stops for the player"),
      })
      .optional(),
  })
  .describe("Scripted traffic that follows its route and yields to the player");

// Mission: an ordered list of steps built from the engine's building blocks,
// plus rules that apply across steps. Texts may use {placeholders} where
// noted.
const text = z.string();
const stepBase = z.object({
  id,
  label: z
    .string()
    .describe(
      "Eyebrow label; consecutive steps with the same label share a number",
    ),
  title: text,
  hint: text,
  checkpoint: z
    .string()
    .optional()
    .describe(
      "Save a restart point when this step starts, with this button label",
    ),
  show: z
    .array(id)
    .optional()
    .describe("Zone ids drawn in the scene during this step"),
  bearing: z
    .object({
      label: z.string(),
      zone: id.optional(),
      gate: id.optional(),
    })
    .optional()
    .describe("Instrument bearing target; defaults to the berth"),
  linesRefused: text
    .optional()
    .describe("Refusal shown for line attachment during this step"),
});
const radio = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).partial().optional();
const holdInZone = stepBase.extend({
  kind: z.literal("holdInZone"),
  zone: id,
  seconds: positive,
  resetOnExit: z.boolean(),
  releases: z
    .array(id)
    .describe("Traffic vessel ids that depart when the hold completes"),
  radio: radio({ start: text, enter: text, reset: text, done: text }),
});
const waitForClear = stepBase.extend({
  kind: z.literal("waitForClear"),
  vessel: id,
  zone: id.describe("Rectangle zone the vessel must leave completely"),
  radio: radio({ start: text, done: text }),
});
const arriveAtBerth = stepBase.extend({
  kind: z.literal("arriveAtBerth"),
  radio: radio({ start: text, done: text }),
});
const secureAlongside = stepBase.extend({
  kind: z.literal("secureAlongside"),
  hintAlongside: text.describe("Hint once the first line is attached"),
  radio: radio({ start: text, done: text }),
});
const item = z.discriminatedUnion("action", [
  z.object({
    id,
    action: z.literal("enginesOff"),
    label: text,
    pending: text.describe("Refusal when a later item is tried first"),
    done: text,
  }),
  z.object({
    id,
    action: z.literal("choice"),
    label: text,
    pending: text,
    options: z
      .array(
        z.object({
          id,
          label: text,
          refusal: text
            .optional()
            .describe("Present on wrong options: why it is refused"),
        }),
      )
      .min(2),
    alreadyDone: text,
    done: text,
  }),
  z.object({
    id,
    action: z.literal("timed"),
    label: text,
    button: text,
    pending: text,
    total: positive,
    unit: z.string(),
    rate: positive.describe("Units per simulation second"),
    running: text,
    alreadyDone: text,
    started: text.describe("{total} {unit}"),
    done: text.describe("{total} {unit}"),
    interrupted: text.describe("{amount} {unit}"),
  }),
  z.object({
    id,
    action: z.literal("confirm"),
    label: text,
    button: text,
    pending: text,
    alreadyDone: text,
    done: text,
  }),
  z.object({
    id,
    action: z.literal("enginesOn"),
    label: text,
  }),
]);
const checklist = stepBase.extend({
  kind: z.literal("checklist"),
  requiresSecured: z.boolean(),
  items: z.array(item).min(1),
  notReady: text.describe("Refusal before this step is reached"),
  unsecured: text.describe("Refusal while no longer secured"),
  radio: radio({ start: text, done: text }),
});
const exitThroughGate = stepBase.extend({
  kind: z.literal("exitThroughGate"),
  gate: id,
  keepSide: z.enum(["starboard", "port"]),
  sidePenalty: z.number().nonnegative().describe("Seconds for the wrong side"),
  radio: radio({ start: text, wrongSide: text.describe("{penalty}") }),
});
const step = z.discriminatedUnion("kind", [
  holdInZone,
  waitForClear,
  arriveAtBerth,
  secureAlongside,
  checklist,
  exitThroughGate,
]);
const rule = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("keepOut"),
      zone: id,
      until: id.describe("Step id; the rule ends when that step completes"),
      penalty: z.number().nonnegative(),
      radio: text.describe("{penalty}"),
      check: text.describe("Objective line while the rule applies"),
    })
    .describe("Penalty for each entry into a zone"),
  z
    .object({
      kind: z.literal("protectedContact"),
      vessel: id,
    })
    .describe("Contact with the vessel where no fender covers the hull fails"),
]);
const tips = z
  .object({
    contacts: text.describe("{count}"),
    trafficClearance: text.describe("{gap} {clearance} {vessel}"),
    arrivalSpeed: text.describe("{kn} {target}"),
    countdownResets: text.describe("{count}"),
    earlyEntries: text,
    wrongSide: text,
    fendersLate: text,
    checklistRefusals: text.describe("{count} {verb}"),
    lineRefusals: text.describe("{count} {verb}"),
    releaseUnderLoad: text,
    time: text.describe("{minutes}"),
    levers: text.describe("{count}"),
    clean: text,
    failed: text.describe("{failure}"),
  })
  .partial();
const scoring = z
  .object({
    weights: z.object({
      impact: z.number().nonnegative(),
      control: z.number().nonnegative(),
      procedure: z.number().nonnegative(),
      smoothness: z.number().nonnegative(),
    }),
    impact: z
      .object({
        perContact: z.number().nonnegative(),
        trafficClearance: positive.describe("Metres hull to hull"),
        trafficDeduction: z.number().nonnegative(),
      })
      .partial(),
    control: z
      .object({
        arrivalRadius: positive,
        arrivalGood: positive.describe("m/s"),
        arrivalPoor: positive.describe("m/s"),
        arrivalDeduction: z.number().nonnegative(),
        perCountdownReset: z.number().nonnegative(),
        perEarlyEntry: z.number().nonnegative(),
        wrongSide: z.number().nonnegative(),
      })
      .partial(),
    procedure: z
      .object({
        fendersLate: z.number().nonnegative(),
        perChecklistRefusal: z.number().nonnegative(),
        perLineRefusal: z.number().nonnegative(),
        perReleaseUnderLoad: z.number().nonnegative(),
      })
      .partial(),
    smoothness: z
      .object({
        parTime: positive.describe("Seconds"),
        slowTime: positive.describe("Seconds"),
        slowTimeScore: z.number().min(0).max(100),
        leverPar: z.number().nonnegative(),
        timeShare: z.number().min(0).max(1),
      })
      .partial(),
    ratings: z.array(z.object({ min: z.number(), label: z.string() })).min(1),
    tips,
  })
  .partial()
  .describe("Debrief score; anything left out uses the engine defaults");
const mission = z.object({
  berth: id.describe("Berth used by the arrive and secure steps"),
  steps: z.array(step).min(1),
  rules: z.array(rule),
  complete: z.object({
    title: text,
    hint: text.describe("{penalty}"),
    radio: text.describe("{time} {penalty}"),
  }),
  scoring: scoring.optional(),
});
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
    traffic: z
      .array(vessel)
      .max(1)
      .describe("Scripted traffic; the engine supports one vessel for now"),
    mission,
  })
  .describe("Leopard / Handling Lab stage");
export type StageFile = z.infer<typeof stageSchema>;
