# Catamaran Game — implementation and scenario plan

Planning date: 22 September 2026. Status: proposed design, no implementation yet.

## Product direction

A browser-based catamaran handling game built around short, replayable situations in recognisable Croatian harbours. The core pleasure is controlling a large vessel precisely: managing momentum, differential engine thrust, wind drift, crew preparation and limited space. Each situation lasts approximately 3–10 minutes and ends with a useful debrief and instant retry.

Start with engine-powered harbour handling. Sailing, passage planning and complex onboard systems are expansion areas. Aim for believable handling with accessible explanations; do not present an unvalidated game as certified skipper training.

Initial scope: one Leopard 42, one Croatian harbour, three connected situations, single player, desktop Chrome on Windows/macOS/Linux. Touch controls and mobile performance follow as a separate acceptance milestone. All locations, timings and conditions below are proposed game content, not verified descriptions of actual port operations.

## Boat reference and fidelity

The manufacturer's September 2024 equipment list for the Leopard 42 provides a baseline: 12.67 m length, 7.04 m beam, 1.40 m half-load draft, 13,691 kg light displacement, twin 45 hp Yanmar diesels with sail drives, and double-lever throttle/gearshift controls. These are a starting reference, not proof of the requested 2026 configuration. The current manufacturer site describes the Leopard 43 as the 42's successor.

Before modelling the exact boat, obtain the target vessel's equipment list, helm photos and relevant manual. Confirm throttle layout, engine/propeller fit, rudder geometry, loading and optional equipment. Do not assume a bow thruster or joystick is fitted. Keep the requested Leopard 42 identity unless the user changes it.

Controls:
- Independent port and starboard combined gear/throttle levers, each with forward, neutral and reverse.
- Wheel/rudder control, engine state and RPM feedback; an explicit neutral-both command.
- Keyboard and mouse, with remappable keys and clickable lever controls. Optional linked-throttle assist for beginners.
- Chase camera, overhead practice camera and helm camera. Helm visibility should use the actual camera position and hull geometry.
- Crew actions for fenders and lines; represent crew through commands and short delays initially.
- Readable speed over ground, heading, rudder angle, gear/RPM, wind and objective status. Separate speed through water where relevant.

Keyboard wheel input should change a persistent rudder setting; provide a centre-rudder command rather than silently forcing car-like self-centering. Stop simulation and clear held input on tab blur to prevent accidental continued input.

## Simulation architecture

Use TypeScript, Vite and Three.js. React can own menus, HUD, settings and debriefs; keep the simulation independent of React render cycles. Start with Three.js WebGLRenderer and WebGL 2 capability detection. Evaluate WebGPU later if there is a measured benefit.

Separate modules:
1. Simulation core: vessel state, propulsion, drag, wind/current forces and integration.
2. Contact model: hull/dock/boat collision shapes, impact response and later mooring constraints.
3. Scenario engine: objectives, triggers, traffic states, success/failure and scoring.
4. Presentation: Three.js scene, cameras, water, audio and effects.
5. Application: input bindings, menus, persistence, asset loading and quality settings.
6. Offline content pipeline: licensed geodata, local coordinate conversion, authored harbour details and packaged assets.

Use a fixed 60 Hz simulation timestep with capped catch-up and interpolated rendering. Simulate low-speed planar motion first: forward/backward, sideways drift and yaw. Display gentle heave/roll/pitch separately so decorative waves cannot change docking outcomes. Keep physics in SI units, converting to knots and degrees at the interface.

Apply thrust at each engine location; compute both resultant force and yaw moment. Include longitudinal/lateral water resistance, angular damping, engine response delay, forward/reverse asymmetry, rudder response to local water flow, wind force and wind-induced yaw. Current affects water-relative velocity; wind uses air-relative velocity. Coefficients are tunable and need calibration, not invented claims of measured accuracy. Keep sail-drive propeller/rudder interactions configurable until confirmed.

Use simple compound hull colliders initially. A collision library can support contacts, but does not provide marine hydrodynamics automatically. Mooring lines begin as validated attach/release actions with distance limits; later add tension-only spring/damper constraints with slack and sensible failure thresholds. Never teleport or snap a moving boat into a berth.

Record input events, scenario seed and periodic state snapshots for replay. Validate results with tolerances across browsers rather than promising bit-identical floating-point simulation.

## Real-world environment pipeline

Recommended foundation: permitted OpenStreetMap vector extracts plus independently authored docks, boats and landmarks. OSM supplies geographic features, not satellite imagery or reliable navigational depth data. Verify local marina detail and completeness before selecting the first location.

Workflow:
1. Select a compact harbour area, approximately 0.5–2 km across, and inspect data availability.
2. Obtain permitted vector data and, if useful, separately licensed elevation/imagery.
3. Project geographic coordinates into a local metre-based system with a documented origin.
4. Build coastline, land meshes and simple buildings; author critical dock edges, fenders, bollards and berths from permitted sources or original observations.
5. Create independent collision geometry, depth zones, traffic paths, playable limits and objective markers.
6. Export versioned glTF/GLB assets and scenario data, with source dates and attribution.
7. Inspect geometry visually and test all berths with the full boat footprint.

Use real geography with a consistent stylised visual treatment. This makes coastline and buildings recognisable while allowing clear, precise docking surfaces. Water, moving boats and the player's vessel are game assets.

Google Maps is a separate optional rendering investigation. Its Map Tiles policies restrict caching and non-visualization uses such as geodata extraction; overlays must not be traced or derived from Photorealistic 3D Tiles. Do not design a pipeline that scrapes Google imagery or converts it into collision geometry. Check current terms, Croatian coverage, attribution, billing and permitted game usage before adopting it. No assumption is made that a particular Google integration is approved.

OSM data licensing and the public OSM tile service are separate matters. Use a permitted vector extract/provider, maintain attribution and assess ODbL obligations for distributed derived databases. Do not bulk-download the public tile service. Never infer safe depth from satellite water colour; use explicitly authored game depth zones until suitable depth data is licensed.

Marina Agana is a candidate for the first recognisable setting. Verify its geometry and operations; do not assume a fuel dock exists there. A fictional training fuel quay can be labelled as such, or choose another verified Croatian fuel location.

## Playable situations

| Stage | Situation | New skill / mechanic | Completion evidence |
|---|---|---|---|
| 1 | Open-water familiarisation | Ahead, neutral, reverse, momentum and stopping | Stop inside a marked area and hold briefly |
| 2 | Turn in confined space | Differential thrust and controlling yaw | Change heading within boundaries without contact |
| 3 | Wait for the fuel berth | Wind drift, heading control and other traffic | Maintain a reasonable holding area and clearance until called |
| 4 | Approach and secure at the fuel quay | Approach planning, fenders, lines and controlled arrival | Correct berth, low relative speed and required lines secured |
| 5 | Refuel and depart | Preparation sequence and planned release of lines | Complete validated checklist and clear the quay safely |
| 6 | Reverse into a marina berth | Stern clearance, camera judgement and crosswind | Secure within a narrow berth without hard contact |
| 7 | Mediterranean mooring | Stern lines and bow restraint sequencing | Establish the specified mooring arrangement without fouling hazards |
| 8 | Pick up a mooring buoy | Low-speed approach and crew timing | Crew connects within reach and speed limits |
| 9 | Anchor in a crowded bay | Placement, depth, scope and swing space | Anchor holds under the scenario wind test with clearance |
| 10 | Single-engine return | Asymmetric propulsion and go-around judgement | Reach an appropriate berth or holding area |
| 11 | Dusk arrival | Visibility, planning and restrained speed | Finish a known harbour task with reduced visual assistance |
| 12 | Charter-day finale | Combining learned skills | Leave berth, negotiate traffic, refuel and return |

Stage 7 needs location-specific setup: lazy-line mooring and anchor stern-to mooring are distinct variants, not one generic procedure. Stage 9 requires its own anchor/holding model. Introduce those after the docking mechanics work.

The MVP contains a short control tutorial plus stages 3–5 as one complete loop. Holding is a short active challenge; do not make players wait several real minutes for scripted traffic. Refuelling itself is a compact checklist and accelerated service interaction, not a prolonged hose minigame.

Each situation has an assisted version and a challenge version. Change one variable at a time: wind, traffic, berth clearance or visibility. Seeded variations support practice and reproducible bug reports. Difficulty should not be an unexplained random gust at the final moment.

## Scenario definitions and scoring

Store scenarios as validated JSON/TypeScript data: version, harbour ID, boat profile, start pose and velocity, weather seed, wind/current, NPC paths and states, holding polygons, dock anchors, objective state machine, thresholds, scoring weights, hints and restart checkpoints.

Fuel mission states: briefing → holding → clearance → approach → secured → service → departure → debrief. Explicit prerequisites prevent premature service or scoring the wrong berth. NPC boats reserve constrained passages and berths; simple predictable state machines are sufficient initially.

Suggested score weighting: 40% impact/clearance, 25% position and speed control, 20% preparation/procedure, 15% smoothness and efficiency. Tune through playtesting. A safe aborted approach should score better than a rushed collision. Time is a minor efficiency factor, never the primary incentive.

Debrief with track replay, closest clearance, approach speed, impacts and one actionable observation. Show the reason for a penalty. Distinguish gentle fender contact from damaging hull impact. Prototype thresholds are game parameters to validate, not operational guidance.

## Implementation milestones

Estimates assume one experienced developer, access to boat references, and modest 3D asset support. They are planning estimates, not delivery commitments; art and handling validation may dominate.

| Milestone | Indicative effort | Deliverable and exit gate |
|---|---|---|
| A. Scope and reference freeze | 2–4 days | Boat reference profile, first location, source permissions and device matrix selected |
| B. Handling prototype | 1–2 weeks | Primitive boat, two levers, rudder, wind, dock and cameras; repeated manoeuvres feel credible |
| C. Complete mission loop | 1–2 weeks | Wait → dock → service → depart, with restart and meaningful debrief |
| D. Croatian setting and boat assets | 1–2 weeks | One recognisable harbour and scaled boat; visuals align with collision geometry |
| E. Browser hardening and playtest | 1–2 weeks | Stable desktop Chrome build, performance tiers, onboarding and calibrated scoring |
| F. Content expansion | Incremental | Additional situations reuse the same engine; advanced mechanics get separate validation |

A presentable MVP is roughly 5–8 weeks under these assumptions; a rough handling prototype should be reviewable much earlier. Do not expand to several harbours before the first docking loop is enjoyable.

## Acceptance criteria and deployment

- Boat coasts in neutral, reverses to brake with delay, and responds correctly to independent engine inputs.
- Mirrored engine inputs yield mirrored yaw in symmetric calm conditions; current and wind produce explainable drift.
- Different rendering frame rates produce materially equivalent mission results under the same inputs.
- Docking cannot succeed through a wall, at excessive speed, at the wrong dock or with missing prerequisites.
- Mooring contact remains stable; retries reset physics, traffic and objectives completely.
- Experienced catamaran operators review stopping, turning and wind response; feedback is recorded against a versioned boat profile.
- Target 60 fps on an agreed mainstream laptop and 30 fps on an agreed lower tier. Measure actual hardware before claiming support. Set a provisional first-play transfer budget around 20 MB compressed and lazy-load later content.
- Test desktop Chrome on Windows, macOS and Linux, including a machine with integrated graphics. Add Android Chrome and iPhone Chrome as explicit later tests; the Chrome name alone is not proof of identical graphics behaviour across platforms.
- Detect unsupported graphics, handle resize/context loss and tab suspension, and provide low-detail settings and readable HUD controls.

Deploy a versioned static browser build over HTTPS/CDN. Keep progress/settings locally for the MVP, with reset/export options. No accounts, database, multiplayer or runtime AI dependency is needed. Introduce server services only for concrete needs such as cloud saves or leaderboards. If using paid map services later, restrict client keys appropriately and plan quotas and billing monitoring.

## Immediate build brief

One grey boat at correct scale, one dock, independent throttles, rudder, adjustable crosswind and a clean docking objective. Review handling first, then connect the holding/refuel/departure loop, then replace the grey environment with the first Croatian harbour.

## Sources checked

- Leopard 42 manufacturer equipment list: https://www.leopardcatamarans.com/wp-content/uploads/2024/01/L42-Standard-Equipment-List-EN-Sep2024.pdf
- Leopard 42 suggested 2025 package: https://www.leopardcatamarans.com/wp-content/uploads/2024/09/L42-183-Suggested-Package-2025.pdf
- Manufacturer comparison of 42 and 43: https://www.leopardcatamarans.com/uk/compare-catamarans/leopard-42-vs-leopard-43
- Three.js WebGLRenderer: https://threejs.org/docs/pages/WebGLRenderer.html
- Three.js WebGPURenderer: https://threejs.org/docs/pages/WebGPURenderer.html
- Google Map Tiles API policies: https://developers.google.com/maps/documentation/tile/policies
- OSM copyright and licence: https://www.openstreetmap.org/copyright
- OSM public tile policy: https://operations.osmfoundation.org/policies/tiles/
