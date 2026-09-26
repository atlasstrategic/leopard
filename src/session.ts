import {
  boat,
  STEP,
  scenario,
  fenderConfig,
  recorderConfig,
  mooringConfig,
  trafficConfig,
  missionConfig,
  type Tuning,
} from "./config";
import { initialFenders, type Side } from "./fenders";
import {
  initialMooring,
  initialLine,
  lineIds,
  attachmentCheck,
  lineGeometry,
  type LineId,
} from "./mooring";
import { Recorder, headingChanged, type Recording } from "./recorder";
import {
  advanceTending,
  stopTending,
  tendingBlock,
  type TendAction,
} from "./tending";
import {
  initialState,
  initialControls,
  initialWeather,
  step,
  type State,
  type Weather,
} from "./simulation";
import {
  advanceVessel,
  initialMonohull,
  startDeparture,
  vesselObstacle,
  type Vessel,
} from "./traffic";
import {
  type Phase,
  type Service,
  initialProgress,
  updateProgress,
  contactAcceptable,
  positioningTarget,
  insideHolding,
  insideFuelZone,
  gateCrossing,
  vesselInFuelZone,
} from "./scenario";
export type RadioMessage = { time: number; message: string };
export type ServiceAction =
  "enginesOff" | "diesel" | "petrol" | "fuel" | "pay" | "enginesOn";
export class FixedClock {
  accumulator = 0;
  advance(delta: number, tick: () => void) {
    this.accumulator += Math.max(0, Math.min(delta, 0.1));
    let count = 0;
    while (this.accumulator + 1e-10 >= STEP && count < 6) {
      tick();
      this.accumulator -= STEP;
      count++;
    }
    this.accumulator = Math.max(0, this.accumulator);
    return this.accumulator / STEP;
  }
  reset() {
    this.accumulator = 0;
  }
}
export class Session {
  state = initialState();
  previous = initialState();
  controls = initialControls();
  weather = initialWeather();
  tuning: Tuning = { ...boat };
  progress = initialProgress();
  clock = new FixedClock();
  paused = false;
  acceptableContact = true;
  fenders = initialFenders();
  mooring = initialMooring();
  // Fuel mission (traffic, holding, service); off in the docking-only
  // practice harbour (Show me), where traffic is null.
  readonly missionEnabled: boolean;
  traffic: Vessel | null;
  previousTraffic: Vessel | null;
  // Harbour radio: short instructions telling the skipper what to do next.
  radio: RadioMessage[] = [];
  recorder = this.newRecorder(1);
  history: Recording[] = [];
  private observed: Record<string, string> = {};
  private loggedHeading = this.state.heading;
  constructor(
    weather: Weather = initialWeather(),
    options: { mission?: boolean } = {},
  ) {
    this.weather = { ...weather };
    this.missionEnabled = options.mission ?? true;
    this.traffic = this.missionEnabled ? initialMonohull() : null;
    this.previousTraffic = this.traffic && { ...this.traffic };
    this.progress = initialProgress(this.missionEnabled);
    this.recorder = this.newRecorder(1);
    this.observed = this.observation();
    this.recorder.sample(0, this.telemetry(), true);
    this.briefing();
  }
  private briefing() {
    if (this.missionEnabled)
      this.announce(
        "Fuel berth occupied. Proceed to the holding area south-east of the quay and wait until called.",
      );
  }
  announce(message: string, time = this.progress.elapsed) {
    this.radio.push({ time, message });
    this.radio = this.radio.slice(-10);
    this.recorder.event(time, "radio", message);
  }
  // Commands are refused once the mission has ended; only Retry continues.
  private failedReason() {
    return this.progress.phase === "failed"
      ? "Mission failed — Retry (R) to start again"
      : this.progress.phase === "complete"
        ? "Mission complete — Retry (R) to go again"
        : "";
  }
  private newRecorder(attempt: number) {
    return new Recorder(
      attempt,
      structuredClone({
        boat: this.tuning,
        scenario,
        weather: this.weather,
        fenderConfig,
        recorderConfig,
        mooringConfig,
        trafficConfig,
        missionConfig,
        fixedStep: STEP,
        build: "milestone-C-holding",
      }),
      this.progress.phase,
    );
  }
  private observation(): Record<string, string> {
    return {
      engines: JSON.stringify({
        port: Math.round(this.controls.port * 1000) / 1000,
        starboard: Math.round(this.controls.starboard * 1000) / 1000,
      }),
      rudder: JSON.stringify({
        degrees: Math.round((this.controls.rudder * 180) / Math.PI),
      }),
      weather: JSON.stringify(this.weather),
      tuning: JSON.stringify(this.tuning),
      pause: JSON.stringify({ paused: this.paused }),
    };
  }
  observe() {
    const next = this.observation();
    for (const [key, value] of Object.entries(next)) {
      if (value !== this.observed[key])
        this.recorder.event(
          this.progress.elapsed,
          `${key}.change`,
          `${key}: ${value}`,
          JSON.parse(value),
        );
    }
    this.observed = next;
  }
  private telemetry(): Record<string, unknown> {
    const s = this.state,
      target = positioningTarget(this.progress.positionTarget);
    return {
      state: { ...s },
      controls: { ...this.controls },
      weather: { ...this.weather },
      fenders: this.fenders,
      mooring: this.mooring,
      traffic: this.traffic && { ...this.traffic },
      acceptableContact: this.acceptableContact,
      course: Math.hypot(s.vx, s.vy) >= 0.15 ? Math.atan2(s.vx, s.vy) : null,
      berthBearing:
        Math.hypot(target.x - s.x, target.y - s.y) >= 0.25
          ? Math.atan2(target.x - s.x, target.y - s.y)
          : null,
      phase: this.recorder.phase,
      progress: { ...this.progress },
      paused: this.paused,
    };
  }
  requestFenders(side: Side): { accepted: boolean; message: string } {
    if (this.failedReason())
      return { accepted: false, message: this.failedReason() };
    if (this.paused)
      return {
        accepted: false,
        message: "Paused — resume (P) before deploying fenders.",
      };
    const f = this.fenders[side];
    if (f.remaining > 0) {
      this.recorder.event(
        this.progress.elapsed,
        "crew.rejected",
        `${side} fender crew already busy`,
        { side },
      );
      return {
        accepted: false,
        message: `${side} crew is already working. Wait for the countdown.`,
      };
    }
    f.target = !f.deployed;
    f.remaining = fenderConfig.crewSeconds;
    this.recorder.event(
      this.progress.elapsed,
      "fender.command",
      `${side} fenders: ${f.target ? "deploy" : "retrieve"} (${fenderConfig.crewSeconds}s)`,
      { side, target: f.target },
    );
    return {
      accepted: true,
      message: `${side} fenders ${f.target ? "deploying" : "being retrieved"} — ${fenderConfig.crewSeconds} seconds of simulation time.`,
    };
  }
  securingRequirements() {
    return {
      fenders:
        this.fenders.starboard.deployed &&
        this.fenders.starboard.remaining === 0,
      lines: lineIds.every((id) => {
        const line = this.mooring[id];
        return (
          line.attached &&
          !line.warning &&
          line.tending === "idle" &&
          line.restLength - lineGeometry(this.state, id).distance <=
            mooringConfig.maxSecuredSlack
        );
      }),
      // Engines switched off for fuel service count as neutral.
      neutral:
        this.progress.service.enginesOff ||
        (Math.abs(this.controls.port) < 0.01 &&
          Math.abs(this.controls.starboard) < 0.01 &&
          Math.abs(this.state.port) < 0.03 &&
          Math.abs(this.state.starboard) < 0.03),
    };
  }
  requestLine(
    id: LineId,
    action: "attach" | "release",
  ): { accepted: boolean; message: string } {
    const def = mooringConfig.lines[id],
      line = this.mooring[id];
    const check = attachmentCheck(
      this.state,
      id,
      scenario.obstacles,
      this.acceptableContact,
    );
    let reason = this.failedReason();
    if (reason) {
      // Failed attempts refuse every crew command.
    } else if (this.paused)
      reason = "Paused — resume (P) to command the line crew";
    else if (action === "release" && !line.attached)
      reason = "Line is not attached";
    else if (action === "attach") {
      if (line.attached) reason = "Line already attached";
      else if (this.progress.phase === "holding")
        reason = "Wait until the fuel berth is called clear";
      else if (this.progress.phase === "approach")
        reason = "First hold the marked berth for 3 seconds";
      else if (!this.securingRequirements().fenders)
        reason = "Deploy starboard fenders and wait for crew completion";
      else if (
        Math.abs(this.controls.port) >= 0.01 ||
        Math.abs(this.controls.starboard) >= 0.01
      )
        reason = "Put both engines in neutral before attaching";
      else if (!check.ok) reason = check.reason;
    }
    if (reason) {
      this.recorder.event(
        this.progress.elapsed,
        "line.rejected",
        `${def.name} / ${def.bollard}: ${reason}`,
        {
          line: id,
          bollard: def.bollard,
          action,
          reason,
          distance: check.distance,
        },
      );
      return { accepted: false, message: reason };
    }
    if (action === "release") {
      this.recorder.event(
        this.progress.elapsed,
        "line.release",
        `${def.name} released from ${def.bollard}${line.warning ? " — under load" : ""}`,
        { line: id, bollard: def.bollard, tensionN: line.tension },
      );
      this.mooring[id] = initialLine();
      if (this.progress.phase === "secured") {
        this.progress.phase = "securing";
        this.progress.success = false;
        this.progress.dwell = 0;
        this.recorder.phase = "securing";
        this.recorder.event(
          this.progress.elapsed,
          "mission.unsecured",
          "Line released — vessel no longer secured",
        );
      }
      return {
        accepted: true,
        message: `${def.name} released. Boat remains live; manage drift before releasing the other line.`,
      };
    }
    this.mooring[id] = {
      ...initialLine(),
      attached: true,
      restLength: check.distance + mooringConfig.slack,
    };
    if (this.progress.positionTarget !== "alongside") {
      this.progress.positionTarget = "alongside";
      this.progress.dwell = 0;
      this.recorder.event(
        this.progress.elapsed,
        "mission.target",
        "First line attached — amber alongside envelope replaces the approach target",
        { target: "alongside", bounds: scenario.alongside },
      );
    }
    this.recorder.event(
      this.progress.elapsed,
      "line.attach",
      `${def.name} attached to ${def.bollard}`,
      {
        line: id,
        bollard: def.bollard,
        distance: check.distance,
        restLength: this.mooring[id].restLength,
        slack: mooringConfig.slack,
      },
    );
    return {
      accepted: true,
      message: `${def.name} attached to ${def.bollard} with ${mooringConfig.slack.toFixed(2)} m slack. Use gradual Take in / Ease; attachment does not move the boat.`,
    };
  }
  requestService(action: ServiceAction): {
    accepted: boolean;
    message: string;
  } {
    const p = this.progress,
      service = p.service,
      cfg = missionConfig.service;
    const neutral =
      Math.abs(this.controls.port) < 0.01 &&
      Math.abs(this.controls.starboard) < 0.01;
    const full = service.litres >= cfg.litres;
    let reason = this.failedReason();
    if (reason) {
      // Failed attempts refuse every command.
    } else if (this.paused) reason = "Paused — resume (P) first";
    else if (!this.missionEnabled)
      reason = "No fuel service in this practice harbour";
    else if (service.completedAt !== null)
      reason = "Fuel service is already complete";
    else if (action === "enginesOn") {
      // Always allowed for safety, e.g. if the boat breaks free.
      if (!service.enginesOff) reason = "Engines are already running";
      else if (!neutral)
        reason = "Put both levers in neutral before starting the engines";
    } else if (p.phase !== "secured")
      reason =
        p.securedAt === null
          ? "Secure the boat alongside first"
          : "Boat no longer secured — re-secure it to continue the service";
    else if (action === "enginesOff") {
      if (service.enginesOff) reason = "Engines are already off";
      else if (!neutral) reason = "Put both levers in neutral first";
    } else if (!service.enginesOff) reason = "Switch both engines off first";
    else if (action === "petrol")
      reason =
        "This Leopard 42 has diesel engines — petrol would damage them. Choose diesel";
    else if (action === "diesel") {
      if (service.fuelConfirmed) reason = "Diesel is already confirmed";
    } else if (action === "fuel") {
      if (!service.fuelConfirmed) reason = "Confirm the fuel type first";
      else if (service.fuelling) reason = "Already fuelling";
      else if (full) reason = "Tank is already full";
    } else if (action === "pay") {
      if (!full) reason = "Finish fuelling first";
      else if (service.paid) reason = "Already paid";
    }
    if (reason) {
      this.recorder.event(p.elapsed, "service.rejected", reason, {
        action,
        reason,
      });
      return { accepted: false, message: reason };
    }
    let message = "";
    if (action === "enginesOff") {
      service.enginesOff = true;
      message = "Engines off. Confirm the fuel type.";
    } else if (action === "diesel") {
      service.fuelConfirmed = true;
      message = "Diesel confirmed. Start fuelling when ready.";
    } else if (action === "fuel") {
      service.fuelling = true;
      message = `Fuelling started — ${cfg.litres} L, accelerated.`;
    } else if (action === "pay") {
      service.paid = true;
      message = "Payment received. Start the engines when ready.";
    } else {
      service.enginesOff = false;
      if (service.fuelling) service.fuelling = false;
      if (service.paid) {
        service.completedAt = p.elapsed;
        message =
          "Service complete. Let go your lines and depart through the harbour entrance, keeping to the starboard side of the channel.";
        p.phase = "departure";
        this.recorder.phase = "departure";
        this.recorder.event(
          p.elapsed,
          "mission.departure",
          "Fuel service complete — depart through the harbour entrance",
          { phase: "departure" },
        );
      } else
        message =
          "Engines running. Switch them off again to continue the service.";
    }
    this.recorder.event(p.elapsed, `service.${action}`, message, {
      litres: service.litres,
    });
    this.announce(message);
    return { accepted: true, message };
  }
  private advanceService(service: Service) {
    if (!service.fuelling) return;
    const time = this.progress.elapsed + STEP,
      cfg = missionConfig.service;
    if (this.progress.phase !== "secured") {
      service.fuelling = false;
      const message = `Fuelling stopped at ${service.litres.toFixed(0)} L: boat no longer secured. Re-secure, then start fuelling again.`;
      this.recorder.event(time, "service.interrupted", message, {
        litres: service.litres,
      });
      this.announce(message, time);
      return;
    }
    service.litres = Math.min(
      cfg.litres,
      service.litres + cfg.litresPerSecond * STEP,
    );
    if (service.litres < cfg.litres - 1e-9) return;
    service.litres = cfg.litres;
    service.fuelling = false;
    const message = `Fuelling complete: ${cfg.litres} L. Please pay.`;
    this.recorder.event(time, "service.fuelled", message, {
      litres: service.litres,
    });
    this.announce(message, time);
  }
  requestTend(
    id: LineId,
    action: TendAction,
  ): { accepted: boolean; message: string } {
    const line = this.mooring[id],
      def = mooringConfig.lines[id];
    const reason = this.failedReason()
      ? this.failedReason()
      : this.paused
        ? "Paused — resume before tending"
        : action === "stop"
          ? ""
          : line.tending !== "idle"
            ? "Crew already adjusting — Stop before changing direction"
            : tendingBlock(this.state, this.controls, this.mooring, id, action);
    if (reason) {
      this.recorder.event(
        this.progress.elapsed,
        "line.tend.rejected",
        `${def.name}: ${reason}`,
        { line: id, action, reason },
      );
      return { accepted: false, message: reason };
    }
    if (action === "stop") stopTending(this.mooring, id);
    else {
      line.tending = action;
      line.adjustmentRemaining = Math.min(
        mooringConfig.tending.step,
        action === "in"
          ? line.restLength - mooringConfig.tending.minLength
          : mooringConfig.tending.maxLength - line.restLength,
      );
    }
    const message =
      action === "stop"
        ? `${def.name}: tending stopped`
        : `${def.name}: ${action === "in" ? "taking in" : "easing"} ${line.adjustmentRemaining.toFixed(2)} m gradually`;
    line.tendStatus = action === "stop" ? "Tending stopped" : "Crew working";
    this.recorder.event(this.progress.elapsed, "line.tend.command", message, {
      line: id,
      action,
      amount: line.adjustmentRemaining,
      tensionN: line.tension,
    });
    return { accepted: true, message };
  }
  tick() {
    this.previous = { ...this.state };
    this.previousTraffic = this.traffic && { ...this.traffic };
    this.observe();
    if (
      this.paused ||
      this.progress.phase === "failed" ||
      this.progress.phase === "complete"
    )
      return;
    if (this.traffic) {
      for (const event of advanceVessel(
        this.traffic,
        this.state,
        this.tuning,
        STEP,
      )) {
        this.trafficEvent(event.type, event.message);
        if (event.type === "traffic.yield")
          this.announce(
            "Monohull holding position: you are in its path. Give way.",
            this.progress.elapsed + STEP,
          );
      }
    }
    const vessel = this.traffic && vesselObstacle(this.traffic);
    for (const side of ["port", "starboard"] as const) {
      const f = this.fenders[side];
      if (f.remaining > 0) {
        f.remaining = Math.max(0, f.remaining - STEP);
        if (f.remaining < 1e-8) {
          f.remaining = 0;
          f.deployed = f.target;
          this.recorder.event(
            this.progress.elapsed + STEP,
            "fender.complete",
            `${side} fenders ${f.deployed ? "deployed" : "stowed"}`,
            { side, deployed: f.deployed },
          );
        }
      }
    }
    for (const event of advanceTending(
      this.state,
      this.controls,
      this.mooring,
      STEP,
    ))
      this.recorder.event(
        this.progress.elapsed + STEP,
        event.type,
        `${mooringConfig.lines[event.id].name}: ${event.reason}`,
        { line: event.id, length: event.length, reason: event.reason },
      );
    const priorLines = structuredClone(this.mooring);
    const priorPhase = this.progress.phase;
    const samples = step(
      this.state,
      // Engines switched off for fuel service deliver no thrust.
      this.progress.service.enginesOff
        ? { ...this.controls, port: 0, starboard: 0 }
        : this.controls,
      this.weather,
      STEP,
      this.tuning,
      scenario.obstacles,
      this.fenders,
      this.mooring,
      vessel ? [vessel] : [],
    );
    this.acceptableContact = contactAcceptable(this.state, samples);
    const bareVesselContact = samples.find(
      (c) => c.obstacleId === trafficConfig.monohull.id && !c.covered,
    );
    const impacts = this.recorder.contacts(
      this.progress.elapsed + STEP,
      samples,
    );
    this.progress.collisions += impacts.collisions;
    this.progress.penalty += impacts.penalties;
    for (const id of lineIds) {
      const old = priorLines[id],
        line = this.mooring[id],
        def = mooringConfig.lines[id];
      if (old.attached && !line.attached && line.broken)
        this.recorder.event(
          this.progress.elapsed + STEP,
          "line.break",
          `${def.name} / ${def.bollard} failed under sustained load`,
          {
            line: id,
            peakTensionN: line.peakTension,
            thresholdN: mooringConfig.breakLoad,
          },
        );
      else if (line.warning !== old.warning)
        this.recorder.event(
          this.progress.elapsed + STEP,
          line.warning ? "line.overload" : "line.load.normal",
          `${def.name} / ${def.bollard}: ${line.warning ? "excessive tension" : "load below warning"}`,
          { line: id, tensionN: line.tension },
        );
    }
    if (bareVesselContact) {
      this.progress.phase = "failed";
      this.progress.failure = `Contact with the ${trafficConfig.monohull.name.toLowerCase()} on the ${bareVesselContact.side} hull where no fender covered it`;
    } else if (this.progress.phase === "holding") this.advanceHolding();
    if (this.traffic && this.progress.phase !== "failed") {
      // Entering the fuel berth before it is called clear: once per entry.
      const inZone = insideFuelZone(this.state);
      if (
        inZone &&
        !this.progress.inFuelZone &&
        this.progress.clearedAt === null
      ) {
        this.progress.earlyEntries++;
        this.progress.penalty += missionConfig.earlyEntryPenalty;
        this.recorder.event(
          this.progress.elapsed + STEP,
          "mission.early_entry",
          `Entered the fuel berth before clearance: +${missionConfig.earlyEntryPenalty}s`,
          { penaltySeconds: missionConfig.earlyEntryPenalty },
        );
        this.announce(
          `Fuel berth not clear. Return to the holding area. +${missionConfig.earlyEntryPenalty} s`,
          this.progress.elapsed + STEP,
        );
      }
      this.progress.inFuelZone = inZone;
    }
    updateProgress(
      this.progress,
      this.state,
      STEP,
      Object.values(this.securingRequirements()).every(Boolean),
      this.acceptableContact,
    );
    this.advanceService(this.progress.service);
    if (this.progress.phase === "departure") this.advanceDeparture();
    // Widened: the calls above may have moved the phase on.
    const phase = this.progress.phase as Phase;
    if (phase !== priorPhase) {
      this.recorder.phase = phase;
      const message =
        phase === "secured"
          ? "Secured: both lines, starboard fenders and neutral held for 3s — simulation remains live"
          : phase === "approach"
            ? "Fuel berth called clear — approach Berth 01"
            : phase === "failed"
              ? `Mission failed: ${this.progress.failure}`
              : phase === "complete"
                ? `Cleared the harbour entrance on the ${this.progress.channelSide} side — fuel mission complete`
                : priorPhase === "approach"
                  ? "Berth held — attach bow and stern lines"
                  : "Secured conditions lost — tend lines and regain the berth";
      this.recorder.event(
        this.progress.elapsed,
        `mission.${phase === "securing" && priorPhase === "secured" ? "unsecured" : phase}`,
        message,
        { phase },
      );
      if (phase === "failed")
        this.announce(
          `Mission failed: ${this.progress.failure}. Retry to start again.`,
        );
      else if (phase === "complete")
        this.announce(
          `Clear of the harbour. Fuel mission complete in ${this.progress.elapsed.toFixed(1)} s with +${this.progress.penalty} s penalties.`,
        );
      else if (phase === "securing" && priorPhase === "approach")
        this.announce(
          "Arrival confirmed. Deploy starboard fenders and make fast bow and stern lines.",
        );
      else if (
        phase === "secured" &&
        this.missionEnabled &&
        !this.announcedSecured
      ) {
        this.announcedSecured = true;
        this.announce(
          "Secured alongside the fuel berth. Switch the engines off to begin the fuel service.",
        );
      }
      this.recorder.sample(this.progress.elapsed, this.telemetry(), true);
    }
    if (headingChanged(this.state.heading, this.loggedHeading)) {
      this.loggedHeading = this.state.heading;
      this.recorder.event(
        this.progress.elapsed,
        "heading.change",
        `Heading ${(((((this.state.heading * 180) / Math.PI) % 360) + 360) % 360) | 0}° T`,
        { heading: this.state.heading },
      );
    }
    this.recorder.sample(this.progress.elapsed, this.telemetry());
  }
  private announcedSecured = false;
  // Departure ends when the boat crosses the entrance gate outward; leaving on
  // the port side of the channel costs a penalty.
  private advanceDeparture() {
    const side = gateCrossing(this.previous, this.state);
    if (!side) return;
    const p = this.progress,
      time = p.elapsed;
    p.channelSide = side;
    p.exitedAt = time;
    if (side === "port") {
      p.penalty += missionConfig.channelSidePenalty;
      this.recorder.event(
        time,
        "mission.channel_side",
        `Left on the port side of the channel: +${missionConfig.channelSidePenalty}s`,
        { penaltySeconds: missionConfig.channelSidePenalty },
      );
      this.announce(
        `Keep to the starboard side of the channel: red light on your starboard side going out. +${missionConfig.channelSidePenalty} s`,
        time,
      );
    }
    p.phase = "complete";
  }
  private trafficEvent(type: string, message: string) {
    const v = this.traffic!;
    this.recorder.event(this.progress.elapsed + STEP, type, message, {
      vessel: trafficConfig.monohull.id,
      x: v.x,
      y: v.y,
      heading: v.heading,
    });
  }
  // Holding: a fixed countdown while the boat's centre is inside the holding
  // area (restarting if it leaves), then the monohull departs; the berth is
  // called clear once the monohull is out of the fuel berth and approach lane.
  private advanceHolding() {
    const p = this.progress,
      v = this.traffic!,
      time = p.elapsed + STEP;
    if (v.status === "moored") {
      const inside = insideHolding(this.state);
      if (!inside) {
        if (p.countdown !== null) {
          p.countdown = null;
          this.recorder.event(
            time,
            "mission.countdown_reset",
            "Left the holding area — countdown reset",
          );
          this.announce(
            "You left the holding area. The countdown restarts when you are back inside.",
            time,
          );
        }
        return;
      }
      if (p.countdown === null) {
        p.countdown = missionConfig.holding.countdown;
        this.recorder.event(
          time,
          "mission.countdown",
          "Holding area reached — countdown started",
        );
        this.announce(
          `Holding area reached. Monohull departs in ${missionConfig.holding.countdown} seconds. Stay inside.`,
          time,
        );
      }
      p.countdown = Math.max(0, p.countdown - STEP);
      if (p.countdown > 1e-9) return;
      p.countdown = 0;
      p.monohullDepartedAt = time;
      for (const event of startDeparture(v))
        this.trafficEvent(event.type, event.message);
      this.announce(
        "Monohull departing the fuel berth. Keep clear and wait to be called.",
        time,
      );
      return;
    }
    const o = vesselObstacle(v);
    if (o && vesselInFuelZone(o)) return;
    p.clearedAt = time;
    p.phase = "approach";
    this.announce(
      "Fuel berth clear. Proceed to Berth 01, bow north, starboard side to.",
      time,
    );
  }
  retry() {
    this.observe();
    this.recorder.sample(this.progress.elapsed, this.telemetry(), true);
    this.recorder.finish(this.progress.elapsed, "retry");
    this.history.unshift(this.recorder.export());
    this.history = this.history.slice(0, recorderConfig.history);
    const nextAttempt = this.recorder.attempt + 1;
    this.state = initialState();
    this.previous = initialState();
    this.controls = initialControls();
    this.progress = initialProgress(this.missionEnabled);
    this.clock.reset();
    this.paused = false;
    this.acceptableContact = true;
    this.fenders = initialFenders();
    this.mooring = initialMooring();
    this.traffic = this.missionEnabled ? initialMonohull() : null;
    this.previousTraffic = this.traffic && { ...this.traffic };
    this.recorder = this.newRecorder(nextAttempt);
    this.observed = this.observation();
    this.loggedHeading = this.state.heading;
    this.recorder.sample(0, this.telemetry(), true);
    this.radio = [];
    this.announcedSecured = false;
    this.briefing();
    // User-selected weather/handling settings deliberately persist across attempts.
  }
  interpolatedTraffic(alpha: number) {
    const v = this.traffic,
      prior = this.previousTraffic;
    if (!v || v.status === "gone") return null;
    if (!prior) return { x: v.x, y: v.y, heading: v.heading };
    return {
      x: prior.x + (v.x - prior.x) * alpha,
      y: prior.y + (v.y - prior.y) * alpha,
      heading: prior.heading + (v.heading - prior.heading) * alpha,
    };
  }
  interpolated(alpha: number): State {
    const s = { ...this.state };
    for (const k of ["x", "y", "heading"] as const)
      s[k] = this.previous[k] + (this.state[k] - this.previous[k]) * alpha;
    return s;
  }
}
