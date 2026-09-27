import {
  boat,
  STEP,
  scenario,
  fenderConfig,
  recorderConfig,
  mooringConfig,
  trafficConfig,
  scoreConfig,
  stage,
  type Tuning,
} from "./config";
import {
  fill,
  midSentence,
  gateCrossing,
  insideZone,
  missionSteps,
  phaseFor,
  vesselInZone,
  zoneShape,
} from "./mission";
import type { Step } from "./stage/load";
import { initialFenders, type Fenders, type Side } from "./fenders";
import {
  initialMooring,
  initialLine,
  lineIds,
  attachmentCheck,
  lineGeometry,
  type LineId,
  type Mooring,
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
  type Controls,
  type State,
  type Weather,
} from "./simulation";
import {
  advanceVessel,
  initialMonohull,
  startDeparture,
  vesselObstacle,
  hullGap,
  type Vessel,
  type VesselObstacle,
} from "./traffic";
import {
  type Progress,
  type Phase,
  type Service,
  initialProgress,
  updateProgress,
  contactAcceptable,
  positioningTarget,
} from "./scenario";
export type RadioMessage = { time: number; message: string };
// Checkpoints are named after the step they restart; see the stage's steps.
export type CheckpointId = string;
// Everything needed to continue an attempt from a saved moment. Weather and
// tuning are not included: like Retry, restarts keep the current settings.
type Checkpoint = {
  attempt: number;
  time: number;
  state: State;
  controls: Controls;
  progress: Progress;
  fenders: Fenders;
  mooring: Mooring;
  traffic: Vessel | null;
  radio: RadioMessage[];
  acceptableContact: boolean;
  loggedHeading: number;
  recorder: Recorder;
};
type Checklist = Extract<Step, { kind: "checklist" }>;
type ChecklistItem = Checklist["items"][number];
// A checklist item id, or a choice option id.
export type ServiceAction = string;
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
  // The stage's full mission (traffic, rules, radio, checklist); off in the
  // docking-only practice harbour (Show me), which runs just the berth steps.
  readonly missionEnabled: boolean;
  readonly steps: Step[];
  traffic: Vessel | null;
  previousTraffic: Vessel | null;
  // Harbour radio: short instructions telling the skipper what to do next.
  radio: RadioMessage[] = [];
  // Saved automatically when a step marked as a checkpoint starts; kept across
  // retries until reached again.
  checkpoints: Partial<Record<CheckpointId, Checkpoint>> = {};
  private pendingCheckpoint: CheckpointId | null = null;
  private inTick = false;
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
    this.steps = missionSteps(this.missionEnabled);
    this.traffic = this.newTraffic();
    this.previousTraffic = this.traffic && { ...this.traffic };
    this.progress = initialProgress(this.missionEnabled);
    this.recorder = this.newRecorder(1);
    this.observed = this.observation();
    this.recorder.sample(0, this.telemetry(), true);
    this.startStep(0);
  }
  private newTraffic() {
    return this.missionEnabled && stage.traffic.length
      ? initialMonohull()
      : null;
  }
  get step(): Step | undefined {
    return this.steps[this.progress.step];
  }
  // Zones and exit marking drawn in the scene for the current step.
  sceneMarks() {
    const step = this.step,
      live = !["complete", "failed"].includes(this.progress.phase);
    return {
      zones: live ? (step?.show ?? []) : [],
      gate: live && step?.kind === "exitThroughGate" ? step.gate : null,
    };
  }
  // The practice harbour has no radio.
  announce(message: string, time = this.progress.elapsed) {
    if (!this.missionEnabled) return;
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
        stage: stage.file,
        fixedStep: STEP,
        build: "stage-plugins",
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
      if (value === this.observed[key]) continue;
      if (key === "engines") this.progress.metrics.leverChanges++;
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
        reason =
          this.step?.linesRefused ?? "Follow the current objective first";
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
      this.progress.metrics.lineRefusals++;
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
      if (line.warning) this.progress.metrics.releasesUnderLoad++;
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
  // The checklist a request applies to: the current step, or the next one.
  private checklist(): { step: Checklist; index: number } | null {
    for (let i = this.progress.step; i < this.steps.length; i++) {
      const st = this.steps[i];
      if (st.kind === "checklist") return { step: st, index: i };
    }
    for (let i = this.progress.step - 1; i >= 0; i--) {
      const st = this.steps[i];
      if (st.kind === "checklist") return { step: st, index: i };
    }
    return null;
  }
  itemComplete(item: ChecklistItem) {
    const service = this.progress.service;
    switch (item.action) {
      case "enginesOff":
        return service.enginesOff;
      case "timed":
        return service.amount >= item.total;
      case "enginesOn":
        return service.completedAt !== null;
      default:
        return service.done.includes(item.id);
    }
  }
  requestService(action: ServiceAction): {
    accepted: boolean;
    message: string;
  } {
    const p = this.progress,
      service = p.service,
      found = this.checklist();
    const neutral =
      Math.abs(this.controls.port) < 0.01 &&
      Math.abs(this.controls.starboard) < 0.01;
    const item = found?.step.items.find(
      (it) =>
        it.id === action ||
        (it.action === "choice" && it.options.some((o) => o.id === action)),
    );
    let reason = this.failedReason();
    if (reason) {
      // Ended attempts refuse every command.
    } else if (this.paused) reason = "Paused — resume (P) first";
    else if (!found) reason = "No checklist in this practice harbour";
    else if (found.index < p.step || service.completedAt !== null)
      reason = "Checklist is already complete";
    else if (!item) reason = `Unknown checklist action "${action}"`;
    else if (item.action === "enginesOn") {
      // Always allowed for safety, e.g. if the boat breaks free.
      if (!service.enginesOff) reason = "Engines are already running";
      else if (!neutral)
        reason = "Put both levers in neutral before starting the engines";
    } else if (found.index !== p.step) reason = found.step.notReady;
    else if (found.step.requiresSecured && p.phase !== "secured")
      reason = found.step.unsecured;
    else if (item.action === "enginesOff") {
      if (service.enginesOff) reason = "Engines are already off";
      else if (!neutral) reason = "Put both levers in neutral first";
    } else {
      // Items complete in order: name the first one still to do.
      const earlier = found.step.items
        .slice(0, found.step.items.indexOf(item))
        .find((it) => it.action !== "enginesOn" && !this.itemComplete(it));
      if (earlier && "pending" in earlier) reason = earlier.pending;
      else if (item.action === "choice") {
        const option = item.options.find((o) => o.id === action);
        if (option?.refusal) reason = option.refusal;
        else if (this.itemComplete(item) || !option) reason = item.alreadyDone;
      } else if (item.action === "timed") {
        if (service.running === item.id) reason = item.running;
        else if (this.itemComplete(item)) reason = item.alreadyDone;
      } else if (item.action === "confirm" && this.itemComplete(item))
        reason = item.alreadyDone;
    }
    if (reason) {
      p.metrics.serviceRefusals++;
      this.recorder.event(p.elapsed, "service.rejected", reason, {
        action,
        reason,
      });
      return { accepted: false, message: reason };
    }
    const list = found!.step,
      it = item!;
    let message = "",
      completes = false;
    if (it.action === "enginesOff") {
      service.enginesOff = true;
      message = it.done;
    } else if (it.action === "choice" || it.action === "confirm") {
      service.done.push(it.id);
      message = it.done;
    } else if (it.action === "timed") {
      service.running = it.id;
      message = fill(it.started, { total: it.total, unit: it.unit });
    } else {
      service.enginesOff = false;
      service.running = null;
      completes = list.items.every(
        (other) =>
          other.action === "enginesOff" ||
          other.action === "enginesOn" ||
          this.itemComplete(other),
      );
      message = completes
        ? (list.radio?.done ?? "Checklist complete.")
        : "Engines running. Switch them off again to continue the service.";
    }
    this.recorder.event(p.elapsed, `service.${action}`, message, {
      amount: service.amount,
    });
    if (completes) {
      service.completedAt = p.elapsed;
      this.completeStep(p.elapsed);
    } else this.announce(message);
    return { accepted: true, message };
  }
  checkpointLabel(id: CheckpointId) {
    return this.steps.find((st) => st.id === id)?.checkpoint ?? id;
  }
  private saveCheckpoint(id: CheckpointId) {
    const time = this.progress.elapsed;
    this.recorder.event(
      time,
      "mission.checkpoint",
      `Checkpoint saved: ${this.checkpointLabel(id)}`,
      { checkpoint: id },
    );
    this.checkpoints[id] = structuredClone({
      attempt: this.recorder.attempt,
      time,
      state: this.state,
      controls: this.controls,
      progress: this.progress,
      fenders: this.fenders,
      mooring: this.mooring,
      traffic: this.traffic,
      radio: this.radio,
      acceptableContact: this.acceptableContact,
      loggedHeading: this.loggedHeading,
      recorder: null,
    }) as unknown as Checkpoint;
    this.checkpoints[id]!.recorder = this.recorder.fork(this.recorder.attempt);
  }
  // Timed checklist items run on the game clock and stop if the boat is no
  // longer secured.
  private advanceService(service: Service) {
    const found = this.checklist(),
      item = found?.step.items.find((it) => it.id === service.running);
    if (!found || !item || item.action !== "timed") return;
    const time = this.progress.elapsed + STEP;
    if (found.step.requiresSecured && this.progress.phase !== "secured") {
      service.running = null;
      const message = fill(item.interrupted, {
        amount: service.amount.toFixed(0),
        unit: item.unit,
      });
      this.recorder.event(time, `service.${item.id}.interrupted`, message, {
        amount: service.amount,
      });
      this.announce(message, time);
      return;
    }
    service.amount = Math.min(item.total, service.amount + item.rate * STEP);
    if (service.amount < item.total - 1e-9) return;
    service.amount = item.total;
    service.running = null;
    const message = fill(item.done, { total: item.total, unit: item.unit });
    this.recorder.event(time, `service.${item.id}.done`, message, {
      amount: service.amount,
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
    this.inTick = true;
    try {
      this.advance();
    } finally {
      this.inTick = false;
    }
  }
  private advance() {
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
        const yieldCall = trafficConfig.monohull?.radio?.yield;
        if (event.type === "traffic.yield" && yieldCall)
          this.announce(yieldCall, this.progress.elapsed + STEP);
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
      vessel ? [vessel, ...stage.moored] : stage.moored,
    );
    this.acceptableContact = contactAcceptable(this.state, samples);
    this.recordMetrics(vessel);
    // Uncovered contact with a moored boat, or with the vessel under a
    // protectedContact rule, fails.
    const protectedIds = new Set(
      this.missionEnabled
        ? [
            ...stage.moored.map((m) => m.id),
            ...stage.mission.rules.flatMap((r) =>
              r.kind === "protectedContact" ? [r.vessel] : [],
            ),
          ]
        : [],
    );
    const bareVesselContact = samples.find(
      (c) => protectedIds.has(c.obstacleId) && !c.covered,
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
      this.progress.failure = `Contact with the ${midSentence(bareVesselContact.obstacleName)} on the ${bareVesselContact.side} hull where no fender covered it`;
    } else if (this.step?.kind === "holdInZone") this.advanceHold(this.step);
    else if (this.step?.kind === "waitForClear") this.advanceClear(this.step);
    if (this.progress.phase !== "failed") this.applyKeepOut();
    updateProgress(
      this.progress,
      this.state,
      STEP,
      Object.values(this.securingRequirements()).every(Boolean),
      this.acceptableContact,
    );
    this.advanceService(this.progress.service);
    const current = this.step,
      now = this.progress.phase as Phase;
    if (current?.kind === "exitThroughGate") this.advanceExit(current);
    else if (
      current?.kind === "arriveAtBerth" &&
      priorPhase === "approach" &&
      now === "securing"
    )
      this.completeStep(this.progress.elapsed);
    else if (current?.kind === "secureAlongside" && now === "secured")
      this.completeStep(this.progress.elapsed);
    // Widened: the calls above may have moved the phase on.
    const phase = this.progress.phase as Phase;
    if (phase !== priorPhase) {
      this.recorder.phase = phase;
      const message = this.phaseMessage(phase, priorPhase);
      this.recorder.event(
        this.progress.elapsed,
        `mission.${phase === "securing" && priorPhase === "secured" ? "unsecured" : phase}`,
        message,
        { phase },
      );
      if (phase === "securing" && priorPhase === "approach")
        this.progress.metrics.fendersAtArrival =
          this.fenders.starboard.deployed;
      if (phase === "failed")
        this.announce(
          `Mission failed: ${this.progress.failure}. Retry to start again.`,
        );
      else if (phase === "complete")
        this.announce(
          fill(stage.mission.complete.radio, {
            time: this.progress.elapsed.toFixed(1),
            penalty: this.progress.penalty,
          }),
        );
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
    // Saved at the end of the tick so the snapshot is a consistent state.
    if (this.pendingCheckpoint) {
      this.saveCheckpoint(this.pendingCheckpoint);
      this.pendingCheckpoint = null;
    }
  }
  private recordMetrics(vessel: VesselObstacle | null) {
    const m = this.progress.metrics,
      p = this.progress,
      s = this.state;
    if (vessel) {
      const gap = hullGap(vessel, s, this.tuning);
      m.closestTraffic = Math.min(m.closestTraffic ?? Infinity, gap);
    }
    const target = positioningTarget(p.positionTarget);
    if (
      (p.phase === "approach" ||
        (p.phase === "securing" && p.securedAt === null)) &&
      Math.hypot(s.x - target.x, s.y - target.y) <=
        scoreConfig.control.arrivalRadius
    )
      m.arrivalPeakSpeed = Math.max(
        m.arrivalPeakSpeed ?? 0,
        Math.hypot(s.vx, s.vy),
      );
  }
  private trafficEvent(type: string, message: string) {
    const v = this.traffic!;
    this.recorder.event(this.progress.elapsed + STEP, type, message, {
      vessel: trafficConfig.monohull?.id,
      x: v.x,
      y: v.y,
      heading: v.heading,
    });
  }
  private phaseMessage(phase: Phase, prior: Phase) {
    const berth = stage.berth.name,
      step = this.step;
    switch (phase) {
      case "secured":
        return "Secured: both lines, fenders and neutral held for 3s — simulation remains live";
      case "approach":
        return `Cleared to approach ${berth}`;
      case "holding":
        return "Holding";
      case "departure":
        return step?.kind === "exitThroughGate"
          ? `Depart through the ${midSentence(stage.gates[step.gate].name)}`
          : "Depart";
      case "failed":
        return `Mission failed: ${this.progress.failure}`;
      case "complete":
        return this.progress.channelSide
          ? `Left on the ${this.progress.channelSide} side of the channel — mission complete`
          : "Mission complete";
      default:
        return prior === "approach"
          ? "Berth held — attach bow and stern lines"
          : "Secured conditions lost — tend lines and regain the berth";
    }
  }
  // Start step i: set the phase its kind implies, announce its start call and
  // save a checkpoint if it is one.
  private startStep(index: number, time = this.progress.elapsed) {
    const p = this.progress,
      step = this.steps[index];
    p.step = index;
    // Each step starts afresh: a hold's countdown never carries into the next.
    p.countdown = null;
    if (!step) return;
    const phase = phaseFor(step);
    if (phase && phase !== p.phase) {
      const prior = p.phase;
      p.phase = phase;
      // Inside a tick the phase-change bookkeeping happens at its end.
      if (!this.inTick) {
        this.recorder.phase = phase;
        this.recorder.event(
          time,
          `mission.${phase}`,
          this.phaseMessage(phase, prior),
          {
            phase,
          },
        );
      }
    }
    if (step.radio?.start) this.announce(step.radio.start, time);
    if (step.checkpoint && index > 0) {
      if (this.inTick) this.pendingCheckpoint = step.id;
      else this.saveCheckpoint(step.id);
    }
  }
  // Finish the current step: announce its done call and start the next one.
  // The last step completes the mission; the practice harbour stays live.
  private completeStep(time: number) {
    const p = this.progress,
      step = this.step;
    if (!step) return;
    const last = p.step === this.steps.length - 1;
    if (last && !this.missionEnabled) return;
    if (step.radio && "done" in step.radio && step.radio.done)
      this.announce(step.radio.done, time);
    if (last) p.phase = "complete";
    else this.startStep(p.step + 1, time);
  }
  // Hold: a fixed countdown while the boat's centre is inside the zone
  // (restarting if it leaves, when resetOnExit), then release traffic.
  private advanceHold(step: Extract<Step, { kind: "holdInZone" }>) {
    const p = this.progress,
      time = p.elapsed + STEP;
    if (!insideZone(zoneShape(step.zone), this.state)) {
      if (p.countdown !== null && step.resetOnExit) {
        p.countdown = null;
        p.metrics.countdownResets++;
        this.recorder.event(
          time,
          "mission.countdown_reset",
          `Left the ${midSentence(stage.zones[step.zone].name)} — countdown reset`,
        );
        if (step.radio?.reset) this.announce(step.radio.reset, time);
      }
      return;
    }
    if (p.countdown === null) {
      p.countdown = step.seconds;
      this.recorder.event(
        time,
        "mission.countdown",
        `${stage.zones[step.zone].name} reached — countdown started`,
      );
      if (step.radio?.enter) this.announce(step.radio.enter, time);
    }
    p.countdown = Math.max(0, p.countdown - STEP);
    if (p.countdown > 1e-9) return;
    p.countdown = 0;
    p.releasedAt = time;
    if (this.traffic && step.releases.includes(trafficConfig.monohull!.id))
      for (const event of startDeparture(this.traffic))
        this.trafficEvent(event.type, event.message);
    this.completeStep(time);
  }
  // Wait until the vessel has left the zone completely.
  private advanceClear(step: Extract<Step, { kind: "waitForClear" }>) {
    const v = this.traffic,
      o = v && v.status !== "gone" ? vesselObstacle(v) : null;
    if (o && vesselInZone(o, zoneShape(step.zone))) return;
    const time = this.progress.elapsed + STEP;
    this.progress.clearedAt = time;
    this.completeStep(time);
  }
  // keepOut rules: a penalty for each entry until the named step completes.
  private applyKeepOut() {
    if (!this.missionEnabled) return;
    const p = this.progress;
    for (const rule of stage.mission.rules) {
      if (rule.kind !== "keepOut") continue;
      const inside = insideZone(zoneShape(rule.zone), this.state);
      const until = this.steps.findIndex((st) => st.id === rule.until);
      if (inside && !p.insideKeepOut[rule.zone] && p.step <= until) {
        const time = p.elapsed + STEP,
          zone = midSentence(stage.zones[rule.zone].name);
        p.earlyEntries++;
        p.penalty += rule.penalty;
        this.recorder.event(
          time,
          "mission.early_entry",
          `Entered the ${zone} before clearance: +${rule.penalty}s`,
          { penaltySeconds: rule.penalty, zone: rule.zone },
        );
        this.announce(fill(rule.radio, { penalty: rule.penalty }), time);
      }
      p.insideKeepOut[rule.zone] = inside;
    }
  }
  // Exit: crossing the gate outward completes the step; the wrong side of the
  // channel costs a penalty.
  private advanceExit(step: Extract<Step, { kind: "exitThroughGate" }>) {
    const side = gateCrossing(
      stage.gates[step.gate],
      this.previous,
      this.state,
    );
    if (!side) return;
    const p = this.progress,
      time = p.elapsed;
    p.channelSide = side;
    p.exitedAt = time;
    if (side !== step.keepSide) {
      p.penalty += step.sidePenalty;
      this.recorder.event(
        time,
        "mission.channel_side",
        `Left on the ${side} side of the channel: +${step.sidePenalty}s`,
        { penaltySeconds: step.sidePenalty },
      );
      if (step.radio?.wrongSide)
        this.announce(
          fill(step.radio.wrongSide, { penalty: step.sidePenalty }),
          time,
        );
    }
    this.completeStep(time);
  }
  // Jump straight to a step, as if the earlier ones were done: for tests and
  // development only. Traffic that an earlier step waited for is gone.
  skipTo(id: string) {
    const index = this.steps.findIndex((st) => st.id === id);
    if (index < 0) throw new Error(`No step "${id}"`);
    const p = this.progress;
    for (const st of this.steps.slice(0, index)) {
      if (st.kind === "waitForClear" && this.traffic)
        this.traffic.status = "gone";
      if (st.kind === "waitForClear") p.clearedAt = p.elapsed;
    }
    const step = this.steps[index];
    p.phase =
      phaseFor(step) ?? (step.kind === "checklist" ? "secured" : "securing");
    this.recorder.phase = p.phase;
    p.step = index;
    p.countdown = null;
  }
  // Retry the whole mission, or restart from a saved checkpoint.
  retry(from?: CheckpointId) {
    this.observe();
    this.recorder.sample(this.progress.elapsed, this.telemetry(), true);
    this.recorder.finish(this.progress.elapsed, "retry");
    this.history.unshift(this.recorder.export());
    this.history = this.history.slice(0, recorderConfig.history);
    const nextAttempt = this.recorder.attempt + 1;
    this.clock.reset();
    this.paused = false;
    this.pendingCheckpoint = null;
    const checkpoint = from && this.checkpoints[from];
    if (checkpoint) {
      this.restore(checkpoint, nextAttempt, from!);
      return;
    }
    this.state = initialState();
    this.previous = initialState();
    this.controls = initialControls();
    this.progress = initialProgress(this.missionEnabled);
    this.acceptableContact = true;
    this.fenders = initialFenders();
    this.mooring = initialMooring();
    this.traffic = this.newTraffic();
    this.previousTraffic = this.traffic && { ...this.traffic };
    this.recorder = this.newRecorder(nextAttempt);
    this.observed = this.observation();
    this.loggedHeading = this.state.heading;
    this.recorder.sample(0, this.telemetry(), true);
    this.radio = [];
    this.startStep(0);
    // User-selected weather/handling settings deliberately persist across attempts.
  }
  private restore(c: Checkpoint, attempt: number, id: CheckpointId) {
    const copy = structuredClone({ ...c, recorder: null });
    this.state = copy.state;
    this.previous = { ...copy.state };
    this.controls = copy.controls;
    this.progress = copy.progress;
    this.fenders = copy.fenders;
    this.mooring = copy.mooring;
    this.traffic = copy.traffic;
    this.previousTraffic = this.traffic && { ...this.traffic };
    this.radio = copy.radio;
    this.acceptableContact = copy.acceptableContact;
    this.loggedHeading = copy.loggedHeading;
    this.progress.metrics.checkpointRestarts++;
    this.recorder = c.recorder.fork(attempt);
    this.recorder.event(
      this.progress.elapsed,
      "attempt.checkpoint",
      `Restarted from checkpoint: ${this.checkpointLabel(id)} (saved in attempt ${c.attempt} at ${c.time.toFixed(1)} s)`,
      { checkpoint: id, fromAttempt: c.attempt, savedAt: c.time },
    );
    this.observed = this.observation();
    this.recorder.sample(this.progress.elapsed, this.telemetry(), true);
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
