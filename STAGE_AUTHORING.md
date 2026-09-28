# Authoring stages

A **stage** is one JSON file, `stages/<id>/stage.json`, that describes a harbour, its traffic and a mission for the Leopard 42. It is data, not code: the game validates it before playing it, and a stage cannot change the physics. This guide is written for people and for AI agents building stages.

Examples: the fuel dock (`stages/fuel-dock/stage.json`) uses every part of the format; open water (`stages/open-water/stage.json`) is a lesson with no mooring, written from this guide by an independent author; the worked example below builds the small `tests/fixtures/west-quay.stage.json`.

## Workflow

1. **Start from an example.** Copy `stages/fuel-dock/stage.json` (everything, alongside), `stages/between-boats/stage.json` (stern-to between moored boats) `stages/town-quay/stage.json` (stern-to with an entrance, traffic and a wait) or `stages/sa-maison/stage.json` (stern-to in a corner, with a second quay alongside the slot) into `stages/<your-id>/stage.json`, or type the small worked example below (it is `tests/fixtures/west-quay.stage.json`). Set `"id"` to the folder name.
2. **Keep the schema reference.** With `"$schema": "../stage.schema.json"` at the top, editors that understand JSON Schema autocomplete fields and show descriptions and units.
3. **Validate** until it is clean:
   ```sh
   npm run stage:validate                        # every stage in stages/
   npm run stage:validate -- path/to/stage.json  # one file anywhere
   ```
   This checks the schema, references between parts, and the geometry (see [Checks](#what-the-tools-check)). Errors must be fixed; warnings are probably mistakes.
4. **Playtest**:
   ```sh
   npm run stage:test -- path/to/stage.json      # or no argument for all bundled stages
   ```
   This plays each mission step with the real engine and names the step that cannot be completed.
5. **Play it.** Open the game, open the **Stage** panel and choose **Load stage file…**. Problems are listed in the panel; a valid file starts at once.
6. **Bundle it** (optional). Add the import to `src/stage/registry.ts` so it appears in the stage picker and at `?stage=<id>`. `npm test` fails if a folder under `stages/` is not listed.

## Coordinates and units

- Metres; **x is east, y is north**. The harbour can sit anywhere; the game frames the camera on the boat and the debrief map on your structures.
- **Headings in degrees true**, clockwise from north: 0 = north, 90 = east, 180 = south.
- Speeds in m/s; **yaw rates in rad/s** (0.025 rad/s ≈ 1.4°/s); times in seconds.
- Wind is given as the direction it blows **from**, like a forecast. For scale: the fuel dock uses 2 m/s (about 4 kn) from the west, a noticeable push on a 42-foot catamaran; 1 m/s is gentle. Players can change the wind in Handling & weather.
- The boat is a Leopard 42: 12.67 m long and 7.04 m wide. Its lines lead from starboard fairleads 3.3 m out from the centreline and 4.6 m forward and aft of the centre, and a crew member can reach a bollard up to **6.5 m** away.

## What the player sees and uses

Write titles, hints and radio calls in terms of these:

- **Controls:** two engine levers, **port** and **starboard**, each from full astern through **neutral** to full ahead in 20% steps (keys Q/A and E/D, W/S or ↑/↓ for both, Space for both neutral), and a persistent **wheel** (arrow keys, X to centre). One lever ahead with the other in neutral or astern turns the boat. Engines respond with a delay; neutral is not a brake.
- **Crew & lines** tab: port and starboard **fenders** (3 seconds to deploy), and **bow** and **stern** lines with Attach/Release and Take in/Ease.
- **Objective panel:** your step's `label` (numbered), `title` and `hint`, the step's checks and a progress bar.
- **Harbour radio** panel: the latest radio call.
- **Scene:** zones listed in a step's `show` are drawn as translucent blue areas (circles with small buoys, rectangles with an outline) with their `label`, only during that step. The berth's approach target is a mint box with an arrow; after the first line is attached it turns amber and shows the alongside envelope. Gates have red and green lights, and a dashed gate line during an exit step.
- **Instruments:** the bearing caption reads `◆ BRG <label> 090° T · 19.9 m`. It follows the step's `bearing`; **without one it points at the berth**, so set `bearing` on every step that is not about the berth.

## File structure

| Part | Contents |
| --- | --- |
| Manifest | `schemaVersion` (1), `id` (lower case, matching the folder), semantic `version`, `name`, `description`, `author`, `area` (where it is set), `buoyage` (`IALA-A` in Europe: red is the port-hand light entering harbour) |
| `scene.start` | The boat's starting pose `{ x, y, heading }` |
| `scene.structures` | Solid axis-aligned rectangles `{ id, name, kind, x, y, width, length }`: `width` is east–west, `length` north–south. `kind` is `quay` (you can moor to it), `breakwater` or `barrier` (the edge of the play area). **Enclose the play area with barriers.** |
| `scene.bollards` | `{ id, structure, x, y }` on a quay. The id is the label shown, e.g. `B01` |
| `scene.berths` | A berth against a quay: its `style` (`alongside`, the default, or `sternTo`), `lines` (bollard ids), for stern-to a `lazyLine` ground point, an `approach` target and an `alongside` envelope (see below), optionally `besides` (other quays it lies against, see below) and an optional short `label` for the instruments' bearing caption (a berth number or bollard id) |
| `scene.zones` | Named `circle` or `rect` areas that steps and rules refer to, with an optional floating `label`. A zone is drawn only during steps that list it in `show`, including a `keepOut` rule's zone |
| `scene.gates` | Harbour entrances: centre, `width` between the two lights and the `outward` direction when leaving (`north`, `east`, `south`, `west`). The lights are placed at the ends; the buoyage decides which is red: under `IALA-A` red is at the end on your starboard side going **out** (port side coming in), so `outward: "north"` puts red at the east end and `"south"` at the west end; `IALA-B` is the reverse |
| `scene.labels` | Floating signs `{ text, x, y, height, width }` |
| `scene.moored` | Optional boats moored in the scene, e.g. the neighbours at a berth (see below) |
| `conditions` | `wind { speed, from }` and `current { x, y }` |
| `traffic` | At most **one** scripted vessel (see below), or none |
| `mission` | The berth used, the steps, the rules, completion texts and optional scoring |

### Berths

- Every stage needs one berth (and so a quay with two bollards), named by `mission.berth`, even if the mission never moors (see [Limits](#limits)).
- `approach` and `alongside` envelopes **may overlap structures and moored boats** (the hull cannot go there anyway); the validator only requires the boat to fit at their centre and at the berth pose clear of everything. Hold zones should stay clear of structures (a warning).
- `approach` is the arrival target: the whole hull must be inside the rectangle, the boat's centre within `positionTolerance` of its centre, heading within `headingTolerance`, below `maxSpeed` and `maxYawRate`, for `dwell` seconds. For an alongside berth make it at least 10 × 17 m; the boat is 7 × 12.7 m. Stern-to it is limited by the slot: about the gap between the neighbours' hulls (8.8 m for the usual slot) by 14 m. It does not have to touch the quay: on its own in open water it works as a "stop box" (the open-water stage ends with one).
- `alongside` is the envelope the boat must settle in once the first line is on. Put it against the quay face, with the **starboard side to the quay**: a boat heading north lies against a quay to its east; heading south, against a quay to its west.
- The quay **face** is worked out from where the alongside envelope sits relative to its quay. Lines attach only from that face, and fender posts are drawn along it.
- Place the bow and stern bollards within 6.5 m of the fairleads when the boat lies about 1 m off the face: roughly level with the boat's bow and stern, 0.5–1 m in from the quay edge. The validator checks this.
- **Rectangles are axis-aligned** whatever their `heading`: `width` is always east–west and `length` north–south. A berth heading east or west therefore has the boat's length along `width`.

#### Stern-to berths

`"style": "sternTo"` moors the boat stern to the quay, usually in a slot between boats moored the same way (see [Moored boats](#moored-boats)), as in most Mediterranean marinas. It needs:

- `lines`: `portQuarter` and `starboardQuarter` bollards (no `bow` or `stern`). The stern lines leave from cleats on each quarter, about 3.3 m either side of the centreline and 6 m aft of the centre; put the bollards 0.5–1 m in from the quay edge, roughly level with each quarter, so they are within 6.5 m when the stern lies about 1 m off the face. The lines must lead aft; crossing them is allowed.
- `lazyLine`: `{ x, y }`, where the lazy line's ground chain lies, in the water off the berth ahead of the moored boat's bow, typically 20–30 m from the quay. The crew picks the lazy line up at the quay once a stern line is on and makes it fast at the bow (a bridle between the bows); it can be paid out to 40 m. The validator checks it lies ahead of the bow and within 40 m of it.
- `approach` and `alongside` headings that point the **bow away from the quay** (heading 270 for a quay to the east). The alongside envelope is the slot the boat settles in once the first line is on.
- By the side of the quay the boat lies against (face = the side of the quay facing the water; `F` is the face's coordinate, `c` the slot's centre along the quay):

  | Quay | Face faces | Heading | `portQuarter` bollard | `starboardQuarter` bollard | Boat centre at `F + 1 m` stern gap |
  | --- | --- | --- | --- | --- | --- |
  | east of the water | west | 270 | south | north | `x = F − 7.3`, `y = c` |
  | west of the water | east | 90 | north | south | `x = F + 7.3`, `y = c` |
  | south of the water | north | 0 | west | east | `x = c`, `y = F + 7.3` |
  | north of the water | south | 180 | east | west | `x = c`, `y = F − 7.3` |

  (7.3 m is 1 m plus half the boat's 12.67 m.) The quarter cleats are 6 m aft of the centre and 3.3 m either side, so the bollards go about 0.7 m inside the face, 3.3 m either side of `c`.
- Fenders on **both** sides before any line goes on; gentle fender contact with a moored neighbour, like with the quay, does not stop securing. The boat has no fenders on its transom, so the stern must not touch the quay.
- A slot about 1.2 m wider than the boat (7.04 m) leaves 0.6 m each side for fenders; the reachability check needs the slot's centre line clear by half the beam plus 0.3 m.

**A slot in a corner.** When one side of the slot is another quay rather than a moored boat (a stern-to slot on a pontoon whose last berth runs up to a quay, like `stages/sa-maison/stage.json`), list that quay in the berth's `besides`: gentle fender contact with it then counts like contact with the berth's own quay. Leave the same fender gap (0.6–0.8 m) between the hull and that quay's face. Without `besides`, touching another structure stops securing.

Arriving stern-to accepts gentle fender contact with a neighbour or the quay (in a crosswind the boat settles on the downwind neighbour's fenders before the lines go on); arriving alongside still needs the boat clear. Make the envelopes as wide (north–south for an east or west quay) as the gap between the neighbours' hulls, so a boat lying on its fenders still fits, and let the berth envelope reach 2–3 m further from the quay than the arrival target: taking in the lazy line pulls the stern off the quay. `stages/between-boats/stage.json` is a worked stern-to stage.

Secured stern-to means both stern lines and the lazy line on, not overloaded, crew idle and slack at most 0.45 m, fenders out both sides, both engines in neutral and the boat in its envelope for 3 s. The lazy line is picked up slack: the player takes it in until it holds the bow off.

### Moored boats

`{ id, name, kind, x, y, heading, length, beam }`, where `kind` is `monohull` (a modern cruising monohull after the Oceanis 38.1, typically 11.5 × 3.99 m) or `catamaran` (after the Leopard 42, 12.67 × 7.04 m). Each is drawn, and collides, with its deck-edge outline scaled to `length` and `beam`; the catamaran's is closed straight across the bows. Moored boats never move. Touching one where no fender covers the hull fails the mission, as with a `protectedContact` vessel, so the player needs fenders out on the side that meets it. Their ids share one list with structures and traffic (contacts name what was touched), and their `name` is used mid-sentence in the failure message ("Contact with the moored catamaran on the starboard hull …"). Use them instead of a fake structure or a traffic vessel that is never released.

A moored boat's `x, y` is the centre of its outline, which runs half its `length` fore and aft along `heading` and half its `beam` either side. To moor one stern-to with its stern `g` metres off a quay face, put its centre `g + length / 2` from the face (1 m and 0.8 m between neighbouring hulls look right; the Leopard's slot needs 0.6–0.75 m each side for fenders). Moored boats have no lines and never leave; a boat that casts off and leaves is a traffic vessel starting where it lies.

### Traffic

One vessel with `length`, `beam` (it is drawn, and collides, as a modern plumb-bowed cruising monohull scaled to these, using its deck-edge outline), a `start` pose, handling limits (`cruiseSpeed`, `accel`, `brake`, `turnRadius`, `pivotYaw`, `maxYaw`, `arriveRadius`, `lookAhead`, `lateralClearance`) and `legs`: waypoints driven `ahead` or `astern`, optionally stopping at one. It waits at its start until a step `releases` it, stops (and can call `radio.yield`) if your boat is in its path, and disappears after its last waypoint. Keep waypoints more than about two turning radii apart, and leave through a gate on its starboard side. The validator simulates the route.

## Mission

`mission.steps` run in order; the last one completes the mission, whatever its kind (an `arriveAtBerth` last ends the mission once the arrival hold is done). Each step has an `id`, an eyebrow `label` (consecutive steps with the same label share a number), a `title` and `hint` for the objective panel, and optionally:

- `radio`: calls made at the step's `start`, on `done`, and kind-specific moments (below);
- `show`: zone ids drawn in the scene during the step;
- `bearing`: `{ label, zone | gate }` for the instruments' bearing caption; the default is the berth;
- `checkpoint`: a button label; a restart point is saved when the step starts;
- `linesRefused`: the refusal shown if the player tries to attach lines during this step.

| Block | Completes when | Specific fields |
| --- | --- | --- |
| `holdInZone` | the boat's centre has stayed in `zone` for `seconds` | `resetOnExit`, `releases` (vessel ids), radio `enter`, `reset`; every reset in any hold step counts towards `perCountdownReset`. Position only: it does not check speed, heading or gear. A small zone and a longer hold encourage stopping; for a real stop, use an `arriveAtBerth` stop box |
| `waitForClear` | `vessel` has left the rectangle `zone` completely | the vessel must be in the zone when the step starts, or the step ends at once (the validator warns) |
| `arriveAtBerth` | the berth's approach target is held | |
| `secureAlongside` | the berth's lines on (both lines alongside; both stern lines and the lazy line stern-to), fenders out (starboard; both sides stern-to), neutral, in the envelope, for 3 s | must directly follow `arriveAtBerth`; `hintAlongside` once the first line is on |
| `checklist` | every item is done in order | `requiresSecured`, `notReady`, `unsecured`, `items` |
| `exitThroughGate` | the boat crosses `gate` outward | `keepSide`, `sidePenalty` (seconds), radio `wrongSide` |

Checklist items, done in order (each has a `label`; all but `enginesOn` have a `pending` text shown when a later item is tried first):

- `enginesOff`: the levers stop delivering thrust; counts as neutral for securing.
- `choice`: `options`, exactly one without a `refusal`; the others are refused with their text.
- `timed`: a task that runs on the game clock (`total`, `unit`, `rate`) and stops if securing is lost when `requiresSecured`.
- `confirm`: a single button.
- `enginesOn`: always allowed once the engines are off (safety); completes the checklist when everything else is done.

`mission.rules` apply across steps: `keepOut` (a `penalty` and `radio` call for each entry into a zone until the step named in `until` completes; `check` is the objective line shown meanwhile; like `holdInZone` it tests the **boat's centre**, not any part of the hull, so draw keep-out zones about half a boat length, roughly 6 m, beyond what they protect) and `protectedContact` (contact with the traffic vessel where no fender covers the hull fails the mission; moored boats are always protected and need no rule).

Texts may use `{placeholders}`: `{penalty}` in penalty calls, `{time}` and `{penalty}` in the completion call, `{total} {unit}` and `{amount} {unit}` in timed items. The schema's descriptions list which apply where.

### Contacts, penalties and failure

- A **contact** is one episode of touching one obstacle (a structure, a moored boat or the traffic vessel): it starts at the first touch and ends after 0.5 s apart. An episode whose peak speed exceeds 0.08 m/s costs **+5 s** once and counts as one **penalised contact**; slower touches are logged but not penalised. Fenders do not make a contact free: covered contact above that speed is still penalised.
- Touching a **moored boat** (or the vessel of a `protectedContact` rule) where no fender covers the hull **fails the mission**. Fenders cover only the outer sides of the hulls, 0.8 m either side of three posts at the centre and 3 m fore and aft; there are no fixed bow or stern fenders. The crew's optional **roving fender** covers 0.8 m round whichever bow or quarter the player sends it to (2 s to move), from any direction; without it, a bow or transom touching another boat fails. A stage cannot require it; mention it in hints where a corner is at risk.
- Gentle (below the envelope's `gentleSpeed`) fender contact with the berth's quay, a quay in its `besides` or a moored boat does not stop securing. Arriving stern-to accepts it too; arriving alongside needs the boat clear.

### Scoring

`mission.scoring` is optional, and anything left out uses these engine defaults (points out of 100 per category; the total is the weighted sum):

| Category (weight) | Deductions |
| --- | --- |
| Impact and clearance (0.4) | `perContact` 25 per penalised contact; up to `trafficDeduction` 30 for coming closer than `trafficClearance` 3 m to the traffic vessel (proportionally) |
| Position and speed control (0.25) | up to `arrivalDeduction` 50 for peak speed within `arrivalRadius` 12 m of the target between `arrivalGood` 0.3 and `arrivalPoor` 0.8 m/s; `perCountdownReset` 10; `perEarlyEntry` 25 per keep-out entry; `wrongSide` 30 |
| Preparation and procedure (0.2) | `fendersLate` 30 if the berth's fenders were not out on arrival; `perChecklistRefusal` 10; `perLineRefusal` 5; `perReleaseUnderLoad` 10 |
| Smoothness (0.15) | time: 100 up to `parTime` 300 s, falling to `slowTimeScore` 40 at `slowTime` 600 s; lever changes beyond `leverPar` 60; time counts for `timeShare` 0.6 of the category |

Ratings default to Excellent (90), Good (75), Fair (60) and Needs practice. A failed mission is not scored. The debrief tips can be overridden one by one and use placeholders such as `{count}`, `{gap}` and `{minutes}` (the schema lists them). `src/stage/load.ts` (`defaultScoring`) is the source of these numbers.

## Worked example: West quay

A harbour with one quay on the west side; the boat arrives from the north, berths bow south with its starboard side to the quay, and the mission ends when it is secured. No traffic.

**1. Manifest.**

```json
"schemaVersion": 1,
"id": "west-quay",
"version": "1.0.0",
"name": "Test · West quay",
"description": "A mirrored harbour with the quay to the west, bow-south berth, no traffic.",
"author": "Leopard tests",
"area": "Test harbour",
"buoyage": "IALA-A",
```

**2. Structures.** The quay runs from x −17 to −7 and y −21 to 21, so its east face (the water side) is at x = −7. Barriers close the north, south and east; the quay itself closes the west.

```json
"structures": [
  { "id": "west-quay", "name": "West quay", "kind": "quay", "x": -12, "y": 0, "width": 10, "length": 42 },
  { "id": "north-limit", "name": "North barrier", "kind": "barrier", "x": 0, "y": 45, "width": 60, "length": 2 },
  { "id": "south-limit", "name": "South barrier", "kind": "barrier", "x": 0, "y": -45, "width": 60, "length": 2 },
  { "id": "east-limit", "name": "East barrier", "kind": "barrier", "x": 30, "y": 0, "width": 2, "length": 92 }
]
```

**3. The berth.** Heading south (180°), the starboard side faces west, onto the quay. The alongside envelope (x −7 to 3) touches the face. Lying 1 m off the face, the boat's centre is at x ≈ −2.5; its bow fairlead is then at about (−5.8, −4.6) and the stern fairlead at (−5.8, 4.6), so bollards at (−7.7, −7) and (−7.7, 7) are about 3 m away.

```json
"bollards": [
  { "id": "W1", "structure": "west-quay", "x": -7.7, "y": -7 },
  { "id": "W2", "structure": "west-quay", "x": -7.7, "y": 7 }
],
"berths": [{
  "id": "west-berth", "name": "West berth", "label": "W", "side": "starboard",
  "structure": "west-quay", "lines": { "bow": "W1", "stern": "W2" },
  "approach": { "x": 0, "y": 0, "width": 10, "length": 17, "heading": 180, "headingTolerance": 8,
                "maxSpeed": 0.18, "maxYawRate": 0.025, "positionTolerance": 1.2, "dwell": 3 },
  "alongside": { "x": -2, "y": 0, "width": 10, "length": 20, "heading": 180, "headingTolerance": 10,
                 "maxSpeed": 0.18, "maxYawRate": 0.025, "gentleSpeed": 0.08, "boundaryAllowance": 0.02 }
}]
```

**4. Start, conditions and traffic.** Start 30 m north of the berth, heading south, in calm water, with no traffic, zones, gates or labels.

**5. Mission.** Two steps and a completion call:

```json
"mission": {
  "berth": "west-berth",
  "steps": [
    { "id": "approach", "kind": "arriveAtBerth", "label": "APPROACH",
      "title": "Approach the west quay.", "hint": "Bow south, starboard side to.",
      "radio": { "start": "Proceed to the west berth.", "done": "Arrival confirmed." } },
    { "id": "secure", "kind": "secureAlongside", "label": "SECURE",
      "title": "Make fast.", "hint": "Attach the first line.", "hintAlongside": "Settle alongside.",
      "radio": { "done": "Secured." } }
  ],
  "rules": [],
  "complete": { "title": "Moored.", "hint": "+{penalty} s",
                "radio": "Moored in {time} s with +{penalty} s penalties." }
}
```

**6. Validate and playtest.**

```text
$ npm run stage:validate -- tests/fixtures/west-quay.stage.json
✔ west-quay (1.0.0)
$ npm run stage:test -- tests/fixtures/west-quay.stage.json
✔ west-quay (1.0.0) · score 100 · +0 s
  ✔ approach (arriveAtBerth) 3.0 s
  ✔ secure (secureAlongside) 3.0 s
```

Move bollard W1 to y = −14 and the validator explains the problem:

```text
✖ bad.json
Stage "west-quay" is invalid:
- Berth alongside: bow line to W1 cannot be attached (Out of reach (9.6 / 6.5 m))
```

## What the tools check

`stage:validate` (and loading a file in the game) checks:

- **Schema:** fields, types, units and allowed values, with the path of each problem.
- **References:** bollards on quays, berths' bollards on their quay, a berth's `besides` naming other quays, zones, gates and vessels named by steps and rules, `secureAlongside` directly after `arriveAtBerth`, a `requiresSecured` checklist after securing, one correct option per choice, rectangle zones for `waitForClear`, unique ids.
- **Geometry** (`stage:validate` only):
  - moored boats clear of structures and of each other;
  - the start pose clear of structures and moored boats;
  - the boat fitting its approach target, clear of structures and moored boats;
  - the berth pose (1 m off the face) inside the envelope, starboard side to the quay (alongside) or bow pointing away from it (stern-to), clear of other structures and moored boats, with its quay lines attachable (face, side or lead, reach and route) and, stern-to, the lazy line ahead of the bow and within 40 m;
  - hold zones clear of structures;
  - reachability from the start for a boat 7 m wide on a 1 m grid, round structures and moored boats: the berth, zones and both sides of every gate (a gap narrower than the boat fails);
  - the traffic route simulated for 600 s (it must finish and stay clear of structures and moored boats; within 0.3 m is a warning). The message names what it hit or passed closest to, the leg and the time. Leaving through a gate on the port side of the channel is a warning;
  - the lazy line in open water (not inside a structure or moored boat);
- **Logic** (warnings): a `waitForClear` whose vessel starts outside its zone (the wait would end at once), and a `keepOut` zone overlapping a zone the player must hold in before the rule ends.

`stage:test` plays each step with the real engine: it deploys the berth's fenders (starboard alongside, both sides stern-to), parks in hold zones, waits (up to 300 s) for traffic to clear, holds the approach target, attaches lines (the lazy line last) and secures, works through the checklist, and motors out through the gate on the correct side. It moves the boat between steps rather than steering there, and lets traffic under way leave the harbour before moving onto the berth or to the exit (traffic that was never released stays where it is). It lists every penalty under the step it happened in (`penalty: …`). It proves that **each step can be completed**; the reachability check covers getting between them, and a human playtest is still the judge of whether the stage is fun and fair.

## Limits

- Every stage needs a berth, and so a quay with two bollards, even when the mission never moors.
- `holdInZone` checks position only; there is no block that requires a stop, a heading or a gear (such as going astern) in open water other than the berth's approach target.
- Structures are axis-aligned rectangles: no angled quays, curves or pontoon fingers yet.
- Alongside berths are starboard side to; stern-to berths have no anchor option; a mission uses one berth.
- At most one traffic vessel. Moored boats cannot cast off; a boat that leaves is a traffic vessel.
- There is no step for **entering** through a gate (`exitThroughGate` only checks leaving); use a hold zone inside the harbour to make the player come in.
- The playtest moves the boat between steps, so it says nothing about how hard the wind makes a stage; playtest it yourself at the stage's wind.
- **Show me** is scripted for the fuel dock only.
- Stages are data only: no new physics (such as anchoring) or custom code.
- The look (materials, water, lighting) is the same for every stage.
