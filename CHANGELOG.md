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
