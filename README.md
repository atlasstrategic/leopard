# Leopard / Handling Lab

A local, single-player catamaran handling prototype with milestone-B handling and milestone-C contact recording, fenders, adjustable mooring lines and a guided demonstration based on [`Catamaran_Game_Implementation_Plan.md`](Catamaran_Game_Implementation_Plan.md). **Fictional training water, not a navigation aid or certified skipper trainer.** No maps, network assets, backend or accounts.

## Run

Node.js **22.12+** (tested here with 24.14):

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5174/**. Port 5174 is intentional: another local project occupied 5173 during development. The server fails rather than silently changing ports; to choose another, use `npm run dev -- --port 5180`.

```sh
npm test            # focused physics, contact, objective and restart checks
npm run typecheck
npm run build       # static output in dist/
```

Use a desktop WebGL 2 browser. A viewport of at least 1100×760 is recommended. Graphics initialization failures/context loss show a recovery message; context loss requires reload. Touch/mobile acceptance and real hardware performance calibration are deferred.

## Play

Approach the mint **Berth 01** rectangle beside the quay, bow north. The entire vessel footprint must be inside, its centre within **1.2 m** of the berth centre, heading **000° ±8°**, speed **≤0.18 m/s (0.35 kn)**, yaw rate **≤0.025 rad/s (1.43°/s)**, and no dock/boundary contact, continuously for **3 seconds**. This arrival hold unlocks **securing**, not a frozen success screen. There is no snapping or automatic mooring. Open **Crew & lines**, deploy starboard fenders, put both engines in neutral and attach bow/stern lines in whichever order suits your approach. The **first successful attachment** replaces the mint approach target with an **amber alongside envelope** (centre x=2 m, y=16 m, 10×20 m, heading 000° ±10°): the old 1.2 m centre tolerance no longer applies. Tend excessive slack with Take in/Ease, keeping both lines attached, crew idle, paid-out slack ≤0.45 m and load below the warning threshold. Hold the alongside envelope, low speed/yaw, neutral/settled thrust and fenders for another **3 seconds** to reach **Secured · live**. The boat, controls, wind and timer keep running; releasing a line or losing a prerequisite revokes secured status. Retry is immediate.

Each new obstacle-contact episode above 0.08 m/s closing speed incurs **+5 seconds**; sustained rubbing is not penalized every frame. Each obstacle has its own episode; returning after more than 0.5 simulation seconds without contact starts a new one. Even gentle/zero-impulse contacts are logged. The HUD contact count counts penalized impacts, not every touch. The HUD/log show elapsed time, first-secured time, contacts and penalty seconds; the final fuel-mission debrief is still to come. These are game thresholds, not safety limits. Scrapes below the threshold still physically collide. The approach hold requires no contact; alongside securing permits only gentle (≤0.08 m/s) **covered**, non-bottomed fender contact against the east quay. Other, hard or unprotected contacts break the dwell.

**First attempt:** set wind to zero, use overhead view, start with both engines at 20–40%, and use short equal reverse bursts well before the target to brake. Neutral retains momentum; engines take time to respond. Port ahead and starboard astern turn the bow to starboard. Small alternating lever corrections work better than chasing the wheel at a standstill.

| Input      | Action                                      |
| ---------- | ------------------------------------------- |
| Q / A      | Port lever up / down in 20% steps           |
| E / D      | Starboard lever up / down in 20% steps      |
| W / S      | Both levers up / down in 20% steps          |
| Hold ← / → | Turn persistent rudder to port / starboard  |
| X          | Centre rudder                               |
| Space      | Both engines neutral (not an instant brake) |
| C          | Chase → overhead → basic helm               |
| P          | Pause / resume                              |
| R          | Retry                                       |

Levers go from reverse through neutral to forward. On-screen sliders and −REV/N/FWD+ buttons work independently; ± buttons change one step rather than commanding full power. The HUD distinguishes commanded lever setting from delayed delivered thrust. Mouse wheel/rudder slider is also available. Input widgets retain ordinary keyboard accessibility; click the scene to return keyboard focus from a slider. Bindings are shown in-game; remapping is deferred.

Blur/tab hiding **pauses and clears held keys**, without silently moving persistent levers or the rudder. Explicit resume is required. Retry clears position, velocity, rotation, actual/commanded engines, wheel, interpolation, timer, dwell, success, contact history and penalties; it deliberately **keeps chosen weather/tuning and camera** for repeatable practice. Restore tuning defaults is separate.

## Guided “Show me” example

Click **Show me** (also available on the paused overlay) to start a separate **calm-water, default-boat** demonstration. Your current practice attempt, controls, weather/tuning, lines, clock and log remain in memory and are preserved **paused** when you return. The guide deploys starboard fenders, approaches and brakes with the regular twin-engine controls, holds the mint arrival target, attaches bow then stern, tends both lines in bounded steps, and waits for the ordinary amber alongside securing checks. Explanatory steps and highlighted controls show why each action matters. It does **not** insert a pose, award a shortcut or copy results into your original attempt. This is **one suitable example in stated conditions**, not a universal attachment order or certified skipper procedure.

**Pause / Resume** freezes the lesson clock; **Repeat** starts the calm example anew; **Take over** leaves you controlling that separate boat, paused until you resume; **Return to practice** restores your saved original attempt, paused until explicit resume. You can export the demonstration's own recorder while viewing it. If the example hits an unexpected impact, breaks a line or exceeds its time budget, it stops and reports why rather than moving the vessel into place. The demo completion is terminal until Take over, Repeat or Return; it cannot be resumed to drift while labelled complete. Leaving or reloading the page clears in-memory attempts.

## Mooring lines (milestone C)

1. Hold the marked berth for 3 seconds; the objective changes to **Secure the boat**.
2. Select **Crew & lines** at the top of the objective panel (scroll inside the panel if needed). Deploy **Starboard** fenders and wait for the crew to finish. You can prepare these during the approach.
3. Put both levers in neutral. Click **Attach B01** for the bow and **Attach B02** for the stern. Named gold bollards are marked on the quay. These are starboard fairleads; keep the quay on that side.
4. On the first attachment the target changes to amber; the boat itself does not move. Use **Take in 0.25 m** or **Ease 0.25 m** for short, gradual paid-out-length changes. Balance bow/stern lines while watching movement and load; **Stop** cancels the remainder. A slack line cannot push the boat. No one attachment order is universally correct.
5. Hold the amber whole-hull envelope, parallel heading, low speed/yaw, protected or no contact, deployed starboard fenders, two lines with ≤0.45 m slack/no load warnings and no crew tending, and neutral engines with delivered thrust settled for **3 seconds**. The objective becomes **Secured · live**. Releasing a line, line failure, excessive load/slack, thrust, fender retrieval or leaving the envelope revokes it; the first-secured timestamp stays recorded. The active alongside target persists if both lines are released; **Retry** restores the mint approach target.

Attachment checks: **≤6.5 m planar line-throwing reach**, fitting speed **≤0.25 m/s**, yaw **≤0.025 rad/s**, water-facing side, no intervening obstacle, no contact or only gentle covered east-quay fender contact, completed arrival hold, deployed starboard fenders and neutral lever commands. Rejections are explained on-screen and recorded. Attachment is an instant validated crew abstraction for this batch, not a simulated person walking/throwing. Fixed bow→B01/stern→B02 assignments avoid silently choosing the wrong bollard.

The line's initial unstretched length is its current fairlead-to-bollard distance **plus 0.20 m slack**. It never shortens automatically or snaps the boat into place. Each accepted Take in/Ease task changes paid-out length by at most **0.25 m** at **0.12 m/s**, within **1–10 m**. Both engine commands must be neutral, fitting speed ≤0.25 m/s; hauling is blocked above **1.8 kN** and easing above **6.5 kN**. Changing conditions interrupt the task; commands, rejections and completion/block reasons are logged. These are provisional **crew/game limits**, not equipment ratings. When stretched, a damped tension-only force acts at the actual fairlead and produces both translation and yaw. Slack lines produce zero force (they cannot push the boat away from the quay). Visual sag is decorative; physics uses planar distance.

Each line displays distance while detached, then load in **kN** and slack/stretch while attached. Cream = slack, mint = loaded, coral = warning. Prototype parameters: 9,000 N/m stiffness, 9,000 N·s/m damping, warning at **7 kN**, and failure after **0.4 continuous seconds** demanding **16 kN** or more. The applied force is capped at that failure load until release/failure. These are unvalidated game coefficients, **not real rope/fitting ratings**. Warning transitions, attachment/rejection/release and breakage are logged; full line state is in 1 Hz telemetry and exports. Releasing under load is permitted and logged, not a recommendation for real seamanship.

Limitations: only two bow/stern lines, no springs/breast lines, simulated winch/crew walking, rope mass, chafe, wrapping or three-dimensional geometry. Attachment routes are checked; subsequent line/obstacle wrapping is not simulated. Two lines do not guarantee station-keeping in every wind—wind pushing toward the quay can slacken both, so fenders and active handling still matter. Retry clears every line and overload timer.

## Contact recorder & fender crew

In **Crew & lines**, click **Port / Starboard** to deploy or retrieve three fenders on that side. Crew actions take **3 simulation seconds** and pause with the game. Orange fenders become visible only when deployment finishes; they remain effective until retrieval finishes. Retry stows both sides and clears outstanding crew tasks. A status line immediately acknowledges clicks and explains paused/working states. Unlike the earlier handling-only prototype, arrival/secured status no longer locks these buttons or freezes the attempt.

Coverage is **local**, at configurable longitudinal stations (-3, 0, +3 m), with a provisional ±0.8 m envelope per station and an outward-facing contact requirement. Bow/stern, tunnel-facing, gaps between stations and the opposite side remain unprotected. The 0.25 m compliant shell applies bounded spring/damper impulses; hard hull contact still applies when it bottoms out. This coarse planar envelope is not an exact collision mesh of the visible cylinders. Fenders provide limited cushioning, **not immunity or a scoring discount**. Hard contacts still incur the same impact penalty. Only a gentle, locally covered, non-bottomed contact against the east quay may count toward **alongside securing**. Any contact blocks the earlier approach dwell; hard, bare, bottomed-out or other-obstacle contact blocks both. Fender coverage never cancels an impact penalty.

**Voyage log & export** shows the latest event and opens a paused, filterable event/contact report. Closing it does not silently resume: press Resume/P explicitly. Contact rows aggregate one obstacle episode and retain:

- Obstacle identity, episode duration/status, peak closing-speed contact point in world/body metres, impacted hull side and normal.
- Pre-solver contact-point closing speed (including yaw), accumulated normal impulse and largest per-tick normal impulse.
- **Estimated peak tick-average load = summed normal impulse in one fixed tick / timestep.** Position projection is excluded. This is solver-dependent, **not physical peak force, hull stress or predicted damage**. Total impulse includes sustained pushing, not just the initial hit.
- Actual deployed sides at the peak-speed contact; whether any covered/unprotected contacts occurred, mixed coverage, maximum compression, bottoming out, and penalty/reason. A fender deployed later does not erase earlier unprotected contact evidence.

Discrete events record lever commands (including two changes within one animation frame), rudder changes in 1° steps, heading changes of at least 5°, weather/current and tuning edits, pause/resume, crew commands/completion/rejection, penalties, mooring attachments/releases/rejections, line tending, load warnings/failures, target changes, guided-demo steps, mission phase transitions and attempt boundaries. **1 Hz telemetry** records commanded/actual engine response, planar pose/velocity, rudder, heading, COG and berth bearing, weather, fenders, mooring state and objective state. Bearings and positions in exports remain SI/radians; UI instruments still use degrees/knots. Engine start/stop does not exist yet; neutral is not logged as an engine shutdown.

Download **JSON** for structured data, or **CSV** with flat contact measurement columns plus full event/telemetry JSON detail. Exports include schema version, units, initial configuration and fixed timestep. Active contact summaries are marked active; their values are final only after separation or attempt end. The recorder is bounded to 4,000 events and 7,200 telemetry snapshots per attempt and reports dropped counts. The viewer shows the newest 150 matching events; exports contain all retained data. The last **3 attempts** remain selectable after retry. Everything is local and in memory: export before reloading. This is diagnostic telemetry, **not yet an exact input replay system**.

The approach/secure/release exercise is playable; holding/clearance, actual refuelling and departure objectives are the following milestone-C batches.

## Helm instruments

Two clean **Raymarine-inspired** screens replace the numeric telemetry strip; they are not an exact model replica. Helm view enlarges them when space permits.

- **Heading:** rotating compass card, fixed bow index, digital HDG and a port/starboard rudder bar. **STBY · MANUAL** is honest status: there is no autopilot.
- **SOG / COG:** speed over ground in knots and course over ground in true degrees. COG follows travel, not the bow (including when reversing), and is blank below 0.15 m/s.
- **◆ BRG 01:** cyan diamond and bearing/distance to the **active** approach or alongside target centre, explicitly a training overlay. Bearing is blank within 0.25 m of that point; the marker never steers the boat.
- **Wind:** click **APPARENT / TRUE**. AWA/TWA is the wind's **from** angle relative to the bow (0° ahead, 180° astern; P/S identifies the side). AWS/TWS is in knots. Red/green sectors indicate port/starboard. **FROM / TRUE** is the selected wind's compass bearing referenced to true north, not magnetic north.
- Apparent wind is air velocity minus boat velocity. True wind is air velocity minus water current (the water-relative/STW convention); with zero current it equals earth-referenced wind. At less than 0.05 m/s, direction/needle are blank rather than inventing a calm-wind direction.

Weather tuning now sets **Wind from (° true)**; its strength remains in SI m/s. Internally the physics still stores air travel direction, so the UI converts by 180° without changing the forces. Default wind is **from west (270° T)**. Instrument mode survives retry alongside the camera/settings. No sensor noise, magnetic variation, instrument damping, depth readings or autopilot controls are simulated yet.

## Architecture

- `src/config.ts`: versioned scenario, obstacles, objective thresholds, weather and configurable vessel profile.
- `src/simulation.ts`: browser-independent SI force model and integration.
- `src/contacts.ts`: compound waterline hull shapes, contact-point measurements, compliant fender shells, dock/boundary contact projection and impulses.
- `src/fenders.ts`: crew state and side/station/normal coverage tests.
- `src/mooring.ts`, `src/tending.ts`: fairlead geometry, attachment routes, tension-only forces and bounded crew adjustments.
- `src/mooring-ui.ts`, `src/mooring.css`: line controls, slack/load readouts and objective/crew section layout.
- `src/recorder.ts`: bounded events/telemetry, obstacle contact episodes, scoring and export schemas.
- `src/log-ui.ts`, `src/log-ui.css`: crew controls, paused log viewer, filters and downloads.
- `src/scenario.ts`: approach/alongside target selection, protected-contact rule, continuous requirements and live secured status.
- `src/demonstration.ts`, `src/demo-ui.ts`, `src/demo.css`: separate recoverable calm-water example, explained steps and lesson controls.
- `src/session.ts`: state lifecycle, reset and fixed-step accumulator.
- `src/input.ts`: key bindings, persistent wheel and held inputs.
- `src/rendering.ts`: procedural Three.js boat/environment, WebGL capability detection and cameras.
- `src/ui.ts`, `src/style.css`: DOM HUD, levers, tuning and debrief; no React dependency.
- `src/instrument-data.ts`: pure wind/navigation vector calculations and display deadbands.
- `src/instruments.ts`, `src/instruments.css`: SVG compass/wind screens, readouts and reference selection.
- `src/main.ts`: animation loop, module composition and browser lifecycle handling.
- `tests/simulation.test.ts`, `tests/instruments.test.ts`, `tests/recorder.test.ts`, `tests/mooring.test.ts`, `tests/alongside-demo.test.ts`: deterministic simulation/objective/contact, instrument math, coverage/crew, episode/measurement, archive/export, mooring-force/stability/validation, and complete approach/secure/release tests.
- `artifacts/`: actual local browser screenshots.

### Units, axes and time

Physics uses metres, seconds, kilograms and radians. World **x=east, y=north**. Heading **0=north**, **π/2=east**, clockwise positive. Body x is starboard, body y is bow. A local point force generates clockwise yaw moment `ry * Fx - rx * Fy`. Three.js uses `(east, up, -north)` and vessel rotation `-heading` about its vertical axis. HUD headings wrap to 000–359° and reference true north. Stored wind direction is **blowing toward**; instruments and weather tuning convert it to the marine **from** convention. Current is configurable in scenario data, initially zero.

Simulation runs at **60 Hz**, at most **6 ticks per animation frame** with a 0.1 s elapsed-time cap. Excess stalled time is discarded, not replayed as dangerous catch-up. Rendering interpolates previous/current planar pose. Paused wall time does not enter the mission timer. Decorative shader ripples and 2.5 cm heave never affect contacts or objectives.

### Boat baseline and provisional fidelity

From the plan's September 2024 Leopard 42 equipment-list reference: **12.67 m length, 7.04 m beam, 1.40 m half-load draft, 13,691 kg light displacement, twin 45 hp Yanmar/sail-drive engines**. These values are not verification of a specific 2026 boat. The visible waterline geometry is scaled to length/beam; submerged hull/draft and deck/helm/rig geometry are illustrative, not survey-derived. No bow thruster or joystick is assumed.

Engine thrust is applied separately at configurable aft port/starboard positions, producing translation and yaw. First-order lag (default 1.1 s) and weaker reverse thrust simulate response. Anisotropic linear/quadratic drag uses **water-relative velocity**. Air drag uses **air-relative velocity**, separate lateral/frontal areas and an offset centre of pressure. Rudders respond to signed water flow, not magic stationary steering. Wind, thrust, response delay, lateral resistance and yaw damping are adjustable live.

All force/drag coefficients, inertia, thrust conversion from nominal horsepower, loading, engine locations, rudder geometry, reverse effectiveness, friction and wind area are **unverified tuning assumptions**. No calibrated RPM or propeller model is claimed; the UI honestly shows thrust response instead. No prop wash, prop walk, gear interlock, shallow-water effects, wakes, wave dynamics, damage or moving boats yet. Fender stiffness/damping, coverage and compression are also unvalidated game parameters.

Hull collision geometry is two rows of overlapping circles, slightly scalloped rather than a high-fidelity mesh. Contacts use eight sequential inelastic impulse/projection passes with rotational effective mass and mild friction, no restitution. Boundaries are visible amber training barriers with matching solids. This is a low-speed discrete solver, **not continuous collision detection for arbitrary externally injected high speeds**. Defaults and tuning ranges target harbour speeds. Contact projection only resolves overlap; it never moves the boat toward the objective.

## GitHub Pages deployment

The checked-in [`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs `npm ci`, tests, typecheck and production build on pushes to `main` (or manually), then deploys **only `dist/`** with GitHub's official Pages artifact/deploy actions. No AWS account, repository secrets or server process are required. The build uses Vite `base: "/leopard/"`, so hashed JS/CSS resolve at `https://OWNER.github.io/leopard/`; local `npm run dev` still serves `/` on port 5174. The published game is public, runs entirely in the browser and **does not save attempts across reloads**.

To publish: create a GitHub repository named **`leopard`**, push this branch to `main`, and in **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source. The Action's `deploy` job then reports the Pages URL. Give the first deployment a few minutes; check WebGL, controls and Show me at `https://OWNER.github.io/leopard/`. The repository currently has no remote configured, so publishing requires a repository and push. The workflow uses only the token GitHub grants it, scoped to Pages deployment. Preview locally with `npm run build && npx vite preview` and open the reported `/leopard/` URL. A custom domain or a differently named repository requires updating the Vite `base` and Pages settings before deploying; this configuration intentionally targets the project URL `/leopard/`.

## Verification / next step

See [`DEVELOPMENT_STATUS.md`](DEVELOPMENT_STATUS.md) for checks actually run and limitations. Optional browser checks are preserved in `tools/`: start Chrome with remote debugging on port 9222 using a separate test profile, start the game, then run:

```sh
# Optional local test tool only; does not change package.json or the lockfile.
npm install --no-save --package-lock=false puppeteer-core
node tools/browser-smoke.mjs
node tools/browser-dock.mjs    # UI-only approach/attach/secure/release/export (~60 simulation seconds)
node tools/browser-recorder.mjs # deliberate bow impact, crew, log, JSON/CSV, retry history
node tools/browser-fenders.mjs  # delayed clicks, both sides, pause, live-secured UI fixture
node tools/browser-show-me.mjs  # UI lesson, pause, takeover, export, repeat and saved practice
# npm ci restores the exact dependency tree afterwards.
```

The scripts target only the local game tab. Dock automation uses DOM lever inputs and HUD speed/time, not a pose injection or hidden autopilot in the game. `PUPPETEER_MODULE` can alternatively point at an existing Puppeteer ES module. These are optional browser tests, not part of `npm test`.

The production bundle is approximately **153 kB gzipped JS** plus approximately 3.4 kB CSS; Vite warns that Three.js makes the uncompressed JS chunk exceed 500 kB. No external assets download at runtime.

Next: milestone C's explicit **holding → clearance → approach → secured → service → departure → debrief** state machine, building on the implemented approach/lines/secured states. Add timed fictional traffic, holding clearance, a compact fuel checklist and a validated departure/debrief. Calibrate low-speed response with experienced operators before claiming training fidelity; Croatian geography and exact boat assets remain milestone D.
