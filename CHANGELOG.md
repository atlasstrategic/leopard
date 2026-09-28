# Changelog

Notable user-facing changes to Leopard / Handling Lab are recorded here. The app version comes from `package.json`; the scenario and exported recording schema have separate version numbers. This is a fictional game prototype, not certified skipper training.

## [Unreleased]

- Added an MIT license for the original repository material and clarified third-party trademark/licensing boundaries. Planned mission stages are listed in the release limitations below.
- The **Wind strength** slider under Handling & weather now uses knots (0–24 kn, 0.5 kn steps), matching the wind and SOG instruments. The default is unchanged at 3.9 kn (2 m/s). Simulation, recordings and exports still use SI m/s.
- Added harbour traffic: a scripted monohull starts at the fuel berth, departs after 5 s, stops for your boat if you block its path and leaves the harbour. Contacts with it are measured relative to its motion and penalised like other obstacles. Show me runs without traffic. Scenario configuration is now version **4**. ([#1](https://github.com/atlasstrategic/leopard/issues/1))
- The fuel mission now starts with **holding and clearance**: harbour-radio announcements, a holding area with a 5 s countdown that resets if you leave, the monohull departing on cue, and the berth called clear before the approach. Entering the fuel berth early costs +10 s per entry. Touching the monohull where no fender covers the hull fails the mission; covered contact is a normal penalty. Scenario version **5**, export schema version **2**. ([#1](https://github.com/atlasstrategic/leopard/issues/1))
- Added the **fuel service checklist** once secured: engines off, confirm diesel, fuel (accelerated), pay, engines on. Out-of-order steps and petrol are refused with an explanation; losing secured stops fuelling until the boat is secured again. ([#1](https://github.com/atlasstrategic/leopard/issues/1))
- Added the **departure**: a breakwater with a harbour entrance marked by red and green lights. After the service, let go the lines and leave between the lights on the starboard side of the channel (+5 s on the port side). Leaving completes the fuel mission. Scenario version **6**. ([#1](https://github.com/atlasstrategic/leopard/issues/1))
- Added the **debrief**: a score out of 100 using the plan's weighting (impact & clearance 40%, position & speed 25%, procedure 20%, smoothness 15%), key figures, penalty reasons, one practical tip and an overhead trace of your track and the monohull's. ([#1](https://github.com/atlasstrategic/leopard/issues/1))
- Added **restart checkpoints**: restart from the approach (berth called clear) or the departure (service complete) instead of repeating the whole mission. The debrief counts restarts. This completes the milestone C mission loop. ([#1](https://github.com/atlasstrategic/leopard/issues/1))
- The harbour layout, conditions and traffic now come from a validated **stage file** (`stages/fuel-dock/stage.json`) with a generated JSON Schema, the first step towards stages as plugins. No change to play. ([#2](https://github.com/atlasstrategic/leopard/issues/2))
- Widened the harbour entrance from 18 m to 24 m (stage version 6.1.0).
- The fuel mission itself (objectives, radio calls, rules, checklist, scoring and checkpoints) now comes from the stage file as reusable building blocks, so other stages can define their own missions. No change to play; checklist events in exports are named after item ids. Stage version 7.0.0. ([#2](https://github.com/atlasstrategic/leopard/issues/2))
- Added a **Stage** panel: choose a bundled stage or load a stage file from your computer (validated first, with problems listed). `?stage=<id>` selects a stage by URL. Show me stays available on the fuel dock. Lines now attach from whichever quay face a berth lies against. ([#2](https://github.com/atlasstrategic/leopard/issues/2))
- Added the stage **authoring kit**: `STAGE_AUTHORING.md`, geometry checks in `npm run stage:validate` (fit, line reach, reachability, traffic routes) and `npm run stage:test`, a step-by-step playtest that names the step a stage cannot complete. ([#2](https://github.com/atlasstrategic/leopard/issues/2))
- Added a second stage, **Open water · First session**: ahead, astern, turning and stopping at marks, then a stop box. It was written from the authoring guide by an independent author. ([#2](https://github.com/atlasstrategic/leopard/issues/2))
- Fixed a hold step that directly follows another hold completing immediately.
- New boat models: the traffic monohull is now a recognisable **Beneteau Oceanis 38.1** (at its published 11.5 × 3.99 m), and the **Leopard 42** has shaped hulls, a saloon with tinted windows, a hardtop, a raised helm and a full-height rig. The monohull now collides with exactly its visible outline (plumb bow, wide transom) instead of a rounded capsule, and backs further off the quay before turning so its stern clears it (stage version 7.2.0).
- Each boat model is merged into one mesh per material once built, so the new models cost no more to draw than the old ones (measured on an integrated laptop GPU).
- The Stage and Handling & weather panels now share one row, so they no longer cover the instruments; one opens at a time.
- ↑ / ↓ now move both levers, like W / S.
- The debrief now states the **wind and current** the run was sailed in, and flags a wind changed during the attempt with its range. Figures a stage cannot produce are left out.
- Fixed an empty "Restart from" row showing in the objective panel before any checkpoint was reached.
- The **harbour radio** folds to one line 8 s after each call so it no longer covers the view; press **V** or its button to open or fold it.
- The objective panel is now a compact **card**: step, time and contacts on one line; the step's hint shows for 10 s, then folds behind **Show hint**. The title bar is one line, the radio sits between the card and the instrument display, and the **helm** moved to the bottom-right corner, so the boat and its berth stay in view. ([#7](https://github.com/atlasstrategic/leopard/issues/7))
- A **rail** down the left edge replaces the top-right toolbar and panel buttons and the objective panel's Crew & lines tab: **Crew**, **Stage** and **Weather** open in a drawer beside it, one at a time; **Log** opens the voyage log; Camera, Pause, Retry and Show me sit at its foot. The instrument display moved to the top-right corner. In Crew & lines the fenders now come first, then the lines. ([#7](https://github.com/atlasstrategic/leopard/issues/7))
- The two instruments are now **one display after the Raymarine autopilot head**: rudder bar, Standby and COG, data boxes and a heading-up compass with the true wind (orange T) and the target bearing (pink diamond). **I** or a click switches to the Wind page (apparent needle, true wind, close-hauled sectors). Night and Day palettes under Handling & weather. ([#7](https://github.com/atlasstrategic/leopard/issues/7))
- The fuel dock's arrival hold is now **1 second** instead of 3, which was very hard in strong wind; the objective panel and line refusals show each stage's own hold time instead of a fixed 3 s.
- The crew has a **roving fender** (Crew & lines): send it to either bow or quarter and it covers that hull corner, which side fenders cannot. Moving it takes 2 s. The stern-to stages and failure hints mention it. ([#5](https://github.com/atlasstrategic/leopard/issues/5))
- New stage **Town quay · Stern-to**, written from the authoring guide by an independent author: wait outside the breakwater while a monohull leaves, come in through the entrance and back into a slot on the south quay with an onshore breeze. ([#4](https://github.com/atlasstrategic/leopard/issues/4))
- The stage checker now warns about a wait for a vessel that starts outside its zone, a keep-out zone over a zone the player must hold in, and traffic leaving on the wrong side of a gate, and rejects a lazy line on land; the playtest lists each penalty under its step. The authoring guide answers the questions both independent authors raised. ([#4](https://github.com/atlasstrategic/leopard/issues/4))
- **Between two boats** is now a stern-to stage: back into a free slot in a row of six boats moored stern-to on the east quay, between a catamaran and a monohull, with a light crosswind from the north; fenders out on both sides, both stern lines, then the lazy line. Arriving stern-to accepts gentle fender contact with a neighbour. ([#4](https://github.com/atlasstrategic/leopard/issues/4))
- Stages can have **stern-to berths**: reverse into a slot, put fenders out on both sides, make fast both stern lines to the quay, then pick up the lazy line and take it in to hold the bow off. The Crew & lines panel, objective and checks follow the berth. ([#4](https://github.com/atlasstrategic/leopard/issues/4))
- The debrief headline now uses the stage's own completion title instead of "Clear of the harbour.", and the map key only lists traffic a stage has. The berth target's heading arrow now points along the berth's heading (it always pointed north).
- Stages can place **moored boats** (a monohull or a catamaran) that are drawn and collide with their outline; touching one where no fender covers the hull fails the mission. The stage checker treats them as obstacles and now says which structure or boat, which leg and when a traffic route hits. ([#4](https://github.com/atlasstrategic/leopard/issues/4))

## [0.1.0] — 2026-09-25

Initial public preview, hosted at [GitHub Pages](https://atlasstrategic.github.io/leopard/).

### Added

- Local, single-player twin-engine catamaran handling with momentum, wind/current, three cameras, clickable/keyboard controls and Raymarine-inspired instruments.
- Fictional berth and solid contacts with a bounded voyage recorder, per-obstacle contact reports, estimated impulse/load, JSON/CSV export and three-attempt in-memory history.
- Independent delayed port/starboard fender deployment with local coverage and cushioning; bow/stern mooring lines with validated attachment, tension-only forces, warnings and breakage.
- Gradual Take in/Ease/Stop controls, with crew rate, paid-out-length, speed and load limits.
- Separate mint approach and amber alongside targets. First line attachment switches the target without moving the boat; securing checks accept only gentle, correctly covered east-quay fender contact and require effective two-line restraint.
- Guided calm-water **Show me** run using ordinary controls and objectives, with explanations, Pause, Repeat, Take over and return to a preserved practice attempt.
- Automated tests and GitHub Actions build/deployment to GitHub Pages.

### Limitations

- The mission ends at a live secured berth; no holding clearance, refuelling or departure objective yet. Boat handling, lines, fenders and load estimates use provisional game parameters. Attempts are not stored across reloads.

There is no Git release tag yet. Scenario configuration is version **3**; JSON/CSV recorder schema is version **1**. Neither is the app's semantic version.
