# Development status

## Completed — milestone B prototype

- TypeScript/Vite/Three.js local game; original implementation plan preserved.
- Procedural Leopard 42 baseline-sized twin hulls; fictional quay, solid amber boundaries and mint target berth.
- Independent delayed forward/neutral/reverse thrust, persistent rudder, differential turning, water-relative resistance, air-relative wind/yaw and stable low-speed compound-hull contacts.
- Chase/overhead/basic helm cameras, HUD, keyboard/clickable controls, tuning, automatic focus-loss pause and explicit resume.
- Clean Raymarine-inspired heading/rudder and apparent/true wind instruments, larger in helm view. True-north HDG/COG/berth bearing distinguished; marine wind-from convention, knots, calm/standstill direction suppression. No pretend autopilot.
- Continuous docking requirements, 3-second dwell, elapsed time/impact penalties and full attempt retry. Separate data, simulation, contact, scenario, input, rendering and DOM UI modules.
- Fixed 60 Hz simulation, interpolated rendering, bounded catch-up, WebGL 2 fallback and context-loss recovery message.

## Verified here

- `npm test`: **20 tests passed** (symmetry, thrust direction/delay, momentum/drag, relative flows, fixed-step 30/60/144 Hz equivalence, bounded catch-up, objective rejection/dwell, sustained dock contact, complete approach, penalties and retry; wind-from sign, rotating reference frames, apparent wind vectors/current, heading vs COG/bearing and angle wrapping).
- `npm run typecheck` and `npm run build`: passed. Build has an informational >500 kB uncompressed Three.js chunk warning (~140 kB gzipped JS).
- **Linux headless Chrome 150**, WebGL 2, 1440×1000: real keyboard and clickable lever inputs, persistent wheel/centre, neutral coasting, all cameras, tuning, focus-loss pause/held-key clearing, retry. **No captured console or page errors** during smoke test. Updated smoke also verifies apparent/true selection, knots, wind-from tuning conversion, larger helm instruments, and instrument/control clearance at 1100×760 (`artifacts/instruments-compact.png`).
- Original milestone-B browser DOM-only calm-water approach (before instrument refresh): **success at 49.1 s, zero contacts/penalties**. No simulation state injection or target snapping. Screenshots: `artifacts/chase.png`, `overhead.png`, `helm.png`, `docking-success.png`. Optional repeatable scripts in `tools/`.
- No Windows/macOS/mobile or physical GPU performance validation; no human skipper handling sign-off. Browser collision feel was not manually assessed; sustained-contact stability is covered by automated simulation checks.

## Known limitations / assumptions

- Manufacturer September 2024 dimensions/equipment baseline, not verified 2026 equipment. Deck/helm/rig/submerged geometry, thrust, inertia, drag, wind area and contact coefficients are provisional. Nominal horsepower is metadata, not a calibrated propeller model.
- Planar low-speed dynamics; no prop wash/walk, gear interlock, waves affecting physics, damage, mooring constraints, shallow-water effects or other vessels. Discrete contact solver is not arbitrary-speed continuous collision detection.
- Instruments are a visual/functional interpretation, not an exact Raymarine model. No sensor noise/damping, magnetic variation, depth sensor or autopilot. True wind uses the water-relative convention; apparent wind is boat-relative.
- Desktop layout recommended ≥1100×760. No remapping, replay recording, sound, persistence or quality tiers yet. Retry intentionally preserves user weather/tuning and camera.
- A single berth challenge, not the full mission. No real Croatian geography, real fuel-service claims, or deployment.

## Next milestone — C

Add holding/traffic clearance → validated fender and line commands → secured berth → short refuelling checklist → release/departure → debrief. Keep this fictional quay while validating the mission loop. Seek experienced-operator feedback on stopping/turning/wind before calibrating coefficients; acquire vessel references and licensed Croatian harbour data for milestone D.
