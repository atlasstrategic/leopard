# Development status

## Playable now

Milestone-B local Three.js twin-engine handling, wind/handling tuning and scenario current, three cameras, Raymarine-inspired instruments and a fictional solid berth. Milestone-C batches: bounded contact/telemetry recorder and JSON/CSV exports; independent delayed fender crew with local cushioning; B01/B02 bow/stern mooring with tension-only fairlead forces, load warnings and failure; live approach → securing → secured states. These are **not** the full fuel mission.

**Alongside correction:** after the first successful line attachment, the mint arrival target switches to a configurable amber alongside whole-hull envelope. The old 1.2 m approach-centre requirement no longer governs securing. Both lines need limited slack, safe load and idle crew; gentle correctly covered east-quay fender contact can count (hard/bare/wrong-obstacle contacts cannot). The active target stays alongside after both lines are released; Retry resets it. Take in/Ease adjusts paid-out length in bounded 0.25 m tasks at 0.12 m/s with neutral/speed/load/length limits, Stop, feedback and events. The vessel is never snapped toward a target.

**Show me:** separate calm-water default-boat run with explanatory steps for fenders, momentum/braking, arrival hold, first-line target switch, paired gradual tending and settling. It uses ordinary session physics, crew commands and objectives; no pose injection. Pause/Repeat/Take over/Return to practice; the original attempt remains preserved, paused. This shows one suitable bow-first method for these conditions, not universal seamanship.

## Verified on this machine

- `npm test`: **58 passed** including along-quay screenshot regression, real contact samples, line-tending safety/limits, demo completion and frame-rate equivalence (30/60/144 Hz), preservation, takeover and fail-stop.
- `npm run typecheck`, `npm run build`, `git diff --check`: passed. Vite reports an informational >500 kB uncompressed chunk warning (~153 kB gzipped JS).
- Linux Chrome 150 WebGL 2 browser **UI-only** “Show me”: completed normal secured state at **81.0 simulation seconds**, **zero impact penalties**; paused/resumed, read-only lesson controls, takeover and Ease, JSON export, restored the saved practice display, repeated cleanly. Checked 1440×1000 and 1100×760; no captured console/page errors. Evidence: `artifacts/show-me-tending.png`, `show-me-complete.png`, `show-me-compact.png`, `show-me-recording.json`; script `tools/browser-show-me.mjs`. Browser check was run before the small terminal-stage guard added afterward; that guard is covered by the final automated run.
- Earlier Chrome smoke/contact/fender/mooring checks: UI controls/cameras, deliberate unprotected bow impact and local coverage, exports/history, and original approach/attach/secure/release at **58.3 s**, zero penalties. These earlier results predate the alongside rule and should **not** be interpreted as a fresh browser check of manual alongside securing. Files and scripts in `artifacts/` and `tools/`.

## Assumptions and next work

September 2024 Leopard 42 dimensional/equipment baseline, not a verified 2026 configuration. Planar low-speed dynamics, visual hull/rig, thrust/drag, line elasticity/failure, fitting capacity, crew rates and fender coverage are **provisional game parameters**, not calibrated or certified safety limits. Contact load is summed solver impulse per fixed tick divided by tick duration, **not physical peak force or damage**. Two lines are not full real-world mooring; no springs/breast lines, rope wrapping/chafe, simulated crew travel, waves, prop effects, depth or moving traffic. Browser feel and real hardware performance have not been validated by a skipper; no Windows/macOS/mobile acceptance.

Next milestone-C batches: holding/traffic clearance → refuelling/service checklist → validated departure → debrief. No actual Croatian geography or real fuel-service claims. See `README.md` for controls, units and verification procedures.
