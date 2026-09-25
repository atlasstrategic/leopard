import {
  boat,
  STEP,
  scenario,
  fenderConfig,
  recorderConfig,
  mooringConfig,
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
  initialProgress,
  updateProgress,
  contactAcceptable,
  positioningTarget,
} from "./scenario";
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
  recorder = this.newRecorder(1);
  history: Recording[] = [];
  private observed: Record<string, string> = {};
  private loggedHeading = this.state.heading;
  constructor(weather: Weather = initialWeather()) {
    this.weather = { ...weather };
    this.recorder = this.newRecorder(1);
    this.observed = this.observation();
    this.recorder.sample(0, this.telemetry(), true);
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
        fixedStep: STEP,
        build: "milestone-C-alongside-tending-demo",
      }),
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
      neutral:
        Math.abs(this.controls.port) < 0.01 &&
        Math.abs(this.controls.starboard) < 0.01 &&
        Math.abs(this.state.port) < 0.03 &&
        Math.abs(this.state.starboard) < 0.03,
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
    let reason = "";
    if (this.paused) reason = "Paused — resume (P) to command the line crew";
    else if (action === "release" && !line.attached)
      reason = "Line is not attached";
    else if (action === "attach") {
      if (line.attached) reason = "Line already attached";
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
  requestTend(
    id: LineId,
    action: TendAction,
  ): { accepted: boolean; message: string } {
    const line = this.mooring[id],
      def = mooringConfig.lines[id];
    const reason = this.paused
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
    this.observe();
    if (this.paused) return;
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
      this.controls,
      this.weather,
      STEP,
      this.tuning,
      scenario.obstacles,
      this.fenders,
      this.mooring,
    );
    this.acceptableContact = contactAcceptable(this.state, samples);
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
    updateProgress(
      this.progress,
      this.state,
      STEP,
      Object.values(this.securingRequirements()).every(Boolean),
      this.acceptableContact,
    );
    if (this.progress.phase !== priorPhase) {
      this.recorder.phase = this.progress.phase;
      const message =
        this.progress.phase === "secured"
          ? "Secured: both lines, starboard fenders and neutral held for 3s — simulation remains live"
          : priorPhase === "approach"
            ? "Berth held — attach bow and stern lines"
            : "Secured conditions lost — tend lines and regain the berth";
      this.recorder.event(
        this.progress.elapsed,
        `mission.${this.progress.phase === "securing" && priorPhase === "secured" ? "unsecured" : this.progress.phase}`,
        message,
        { phase: this.progress.phase },
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
    this.progress = initialProgress();
    this.clock.reset();
    this.paused = false;
    this.acceptableContact = true;
    this.fenders = initialFenders();
    this.mooring = initialMooring();
    this.recorder = this.newRecorder(nextAttempt);
    this.observed = this.observation();
    this.loggedHeading = this.state.heading;
    this.recorder.sample(0, this.telemetry(), true);
    // User-selected weather/handling settings deliberately persist across attempts.
  }
  interpolated(alpha: number): State {
    const s = { ...this.state };
    for (const k of ["x", "y", "heading"] as const)
      s[k] = this.previous[k] + (this.state[k] - this.previous[k]) * alpha;
    return s;
  }
}
