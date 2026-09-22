# Leopard / Handling Lab

A local, single-player milestone-B catamaran handling prototype based on [`Catamaran_Game_Implementation_Plan.md`](Catamaran_Game_Implementation_Plan.md). **Fictional training water, not a navigation aid or certified skipper trainer.** No maps, network assets, backend or accounts.

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

Approach the mint **Berth 01** rectangle beside the quay, bow north. The entire vessel footprint must be inside, its centre within **1.2 m** of the berth centre, heading **000° ±8°**, speed **≤0.18 m/s (0.35 kn)**, yaw rate **≤0.025 rad/s (1.43°/s)**, and no dock/boundary contact, continuously for **3 seconds**. There is no snapping or automatic mooring. Success freezes the attempt for debrief. Retry is immediate.

Each new impact episode above 0.08 m/s incurs **+5 seconds**; sustained rubbing is not penalized every frame. The debrief shows elapsed time, contacts and penalty-adjusted time. These are game thresholds, not safety limits. Scrapes below the threshold still physically collide and prevent dwell.

**First attempt:** set wind to zero, use overhead view, start with both engines at 20–40%, and use short equal reverse bursts well before the target to brake. Neutral retains momentum; engines take time to respond. Port ahead and starboard astern turn the bow to starboard. Small alternating lever corrections work better than chasing the wheel at a standstill.

| Input | Action |
|---|---|
| Q / A | Port lever up / down in 20% steps |
| E / D | Starboard lever up / down in 20% steps |
| W / S | Both levers up / down in 20% steps |
| Hold ← / → | Turn persistent rudder to port / starboard |
| X | Centre rudder |
| Space | Both engines neutral (not an instant brake) |
| C | Chase → overhead → basic helm |
| P | Pause / resume |
| R | Retry |

Levers go from reverse through neutral to forward. On-screen sliders and −REV/N/FWD+ buttons work independently; ± buttons change one step rather than commanding full power. The HUD distinguishes commanded lever setting from delayed delivered thrust. Mouse wheel/rudder slider is also available. Input widgets retain ordinary keyboard accessibility; click the scene to return keyboard focus from a slider. Bindings are shown in-game; remapping is deferred.

Blur/tab hiding **pauses and clears held keys**, without silently moving persistent levers or the rudder. Explicit resume is required. Retry clears position, velocity, rotation, actual/commanded engines, wheel, interpolation, timer, dwell, success, contact history and penalties; it deliberately **keeps chosen weather/tuning and camera** for repeatable practice. Restore tuning defaults is separate.

## Helm instruments

Two clean **Raymarine-inspired** screens replace the numeric telemetry strip; they are not an exact model replica. Helm view enlarges them when space permits.

- **Heading:** rotating compass card, fixed bow index, digital HDG and a port/starboard rudder bar. **STBY · MANUAL** is honest status: there is no autopilot.
- **SOG / COG:** speed over ground in knots and course over ground in true degrees. COG follows travel, not the bow (including when reversing), and is blank below 0.15 m/s.
- **◆ BRG 01:** cyan diamond and bearing/distance to the berth centre, explicitly a training overlay. Bearing is blank within 0.25 m of that point; the marker never steers the boat.
- **Wind:** click **APPARENT / TRUE**. AWA/TWA is the wind's **from** angle relative to the bow (0° ahead, 180° astern; P/S identifies the side). AWS/TWS is in knots. Red/green sectors indicate port/starboard. **FROM / TRUE** is the selected wind's compass bearing referenced to true north, not magnetic north.
- Apparent wind is air velocity minus boat velocity. True wind is air velocity minus water current (the water-relative/STW convention); with zero current it equals earth-referenced wind. At less than 0.05 m/s, direction/needle are blank rather than inventing a calm-wind direction.

Weather tuning now sets **Wind from (° true)**; its strength remains in SI m/s. Internally the physics still stores air travel direction, so the UI converts by 180° without changing the forces. Default wind is **from west (270° T)**. Instrument mode survives retry alongside the camera/settings. No sensor noise, magnetic variation, instrument damping, depth readings or autopilot controls are simulated yet.

## Architecture

- `src/config.ts`: versioned scenario, obstacles, objective thresholds, weather and configurable vessel profile.
- `src/simulation.ts`: browser-independent SI force model and integration.
- `src/contacts.ts`: compound waterline hull shapes, dock/boundary contact projection and impulses.
- `src/scenario.ts`: requirements, continuous dwell, timing and collision penalties.
- `src/session.ts`: state lifecycle, reset and fixed-step accumulator.
- `src/input.ts`: key bindings, persistent wheel and held inputs.
- `src/rendering.ts`: procedural Three.js boat/environment, WebGL capability detection and cameras.
- `src/ui.ts`, `src/style.css`: DOM HUD, levers, tuning and debrief; no React dependency.
- `src/instrument-data.ts`: pure wind/navigation vector calculations and display deadbands.
- `src/instruments.ts`, `src/instruments.css`: SVG compass/wind screens, readouts and reference selection.
- `src/main.ts`: animation loop, module composition and browser lifecycle handling.
- `tests/simulation.test.ts`, `tests/instruments.test.ts`: deterministic simulation/objective/contact and instrument math tests.
- `artifacts/`: actual local browser screenshots.

### Units, axes and time

Physics uses metres, seconds, kilograms and radians. World **x=east, y=north**. Heading **0=north**, **π/2=east**, clockwise positive. Body x is starboard, body y is bow. A local point force generates clockwise yaw moment `ry * Fx - rx * Fy`. Three.js uses `(east, up, -north)` and vessel rotation `-heading` about its vertical axis. HUD headings wrap to 000–359° and reference true north. Stored wind direction is **blowing toward**; instruments and weather tuning convert it to the marine **from** convention. Current is configurable in scenario data, initially zero.

Simulation runs at **60 Hz**, at most **6 ticks per animation frame** with a 0.1 s elapsed-time cap. Excess stalled time is discarded, not replayed as dangerous catch-up. Rendering interpolates previous/current planar pose. Paused wall time does not enter the mission timer. Decorative shader ripples and 2.5 cm heave never affect contacts or objectives.

### Boat baseline and provisional fidelity

From the plan's September 2024 Leopard 42 equipment-list reference: **12.67 m length, 7.04 m beam, 1.40 m half-load draft, 13,691 kg light displacement, twin 45 hp Yanmar/sail-drive engines**. These values are not verification of a specific 2026 boat. The visible waterline geometry is scaled to length/beam; submerged hull/draft and deck/helm/rig geometry are illustrative, not survey-derived. No bow thruster or joystick is assumed.

Engine thrust is applied separately at configurable aft port/starboard positions, producing translation and yaw. First-order lag (default 1.1 s) and weaker reverse thrust simulate response. Anisotropic linear/quadratic drag uses **water-relative velocity**. Air drag uses **air-relative velocity**, separate lateral/frontal areas and an offset centre of pressure. Rudders respond to signed water flow, not magic stationary steering. Wind, thrust, response delay, lateral resistance and yaw damping are adjustable live.

All force/drag coefficients, inertia, thrust conversion from nominal horsepower, loading, engine locations, rudder geometry, reverse effectiveness, friction and wind area are **unverified tuning assumptions**. No calibrated RPM or propeller model is claimed; the UI honestly shows thrust response instead. No prop wash, prop walk, gear interlock, shallow-water effects, wakes, wave dynamics, mooring lines, damage or moving boats yet.

Hull collision geometry is two rows of overlapping circles, slightly scalloped rather than a high-fidelity mesh. Contacts use eight sequential inelastic impulse/projection passes with rotational effective mass and mild friction, no restitution. Boundaries are visible amber training barriers with matching solids. This is a low-speed discrete solver, **not continuous collision detection for arbitrary externally injected high speeds**. Defaults and tuning ranges target harbour speeds. Contact projection only resolves overlap; it never moves the boat toward the objective.

## Verification / next step

See [`DEVELOPMENT_STATUS.md`](DEVELOPMENT_STATUS.md) for checks actually run and limitations. Optional browser checks are preserved in `tools/`: start Chrome with remote debugging on port 9222 using a separate test profile, start the game, then run:

```sh
# Optional local test tool only; does not change package.json or the lockfile.
npm install --no-save --package-lock=false puppeteer-core
node tools/browser-smoke.mjs
node tools/browser-dock.mjs    # ~50 simulation seconds; run after smoke
# npm ci restores the exact dependency tree afterwards.
```

The scripts target only the local game tab. Dock automation uses DOM lever inputs and HUD speed/time, not a pose injection or hidden autopilot in the game. `PUPPETEER_MODULE` can alternatively point at an existing Puppeteer ES module. These are optional browser tests, not part of `npm test`.

The production bundle is approximately **140 kB gzipped JS** plus approximately 3 kB CSS; Vite warns that Three.js makes the uncompressed JS chunk exceed 500 kB. No external assets download at runtime.

Next: milestone C's explicit **holding → clearance → approach → secured → service → departure → debrief** state machine, with timed fictional traffic, distance/speed-validated fender/line commands and a compact fuel checklist. Calibrate low-speed response with experienced operators before claiming training fidelity; Croatian geography and exact boat assets remain milestone D.
