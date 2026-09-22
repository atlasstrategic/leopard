import { boat, STEP, type Tuning } from "./config";
import {
  initialState,
  initialControls,
  initialWeather,
  step,
  type State,
} from "./simulation";
import { initialProgress, updateProgress } from "./scenario";
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
  tick() {
    this.previous = { ...this.state };
    if (this.progress.success) return;
    step(this.state, this.controls, this.weather, STEP, this.tuning);
    updateProgress(this.progress, this.state, STEP);
  }
  retry() {
    this.state = initialState();
    this.previous = initialState();
    this.controls = initialControls();
    this.progress = initialProgress();
    this.clock.reset();
    this.paused = false;
    // User-selected weather/handling settings deliberately persist across attempts.
  }
  interpolated(alpha: number): State {
    const s = { ...this.state };
    for (const k of ["x", "y", "heading"] as const)
      s[k] = this.previous[k] + (this.state[k] - this.previous[k]) * alpha;
    return s;
  }
}
