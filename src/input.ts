import { clamp } from "./simulation";
import type { Session } from "./session";
export class Input {
  held = new Set<string>();
  constructor(
    private game: Session,
    private actions: {
      camera: () => void;
      radio: () => void;
      instrument: () => void;
      retry: () => void;
      pause: () => void;
    },
    private readOnly: () => boolean = () => false,
  ) {
    window.addEventListener("keydown", (e) => {
      const game = this.game;
      const target = e.target as HTMLElement;
      if (
        target.matches("input, select, textarea") ||
        (target.matches("button") && ["Space", "Enter"].includes(e.code))
      )
        return;
      const valid = [
        "KeyQ",
        "KeyA",
        "KeyE",
        "KeyD",
        "KeyW",
        "KeyS",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "KeyX",
        "Space",
        "KeyC",
        "KeyV",
        "KeyI",
        "KeyR",
        "KeyP",
      ];
      if (!valid.includes(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === "KeyP") {
        actions.pause();
        return;
      }
      if (e.code === "KeyR") {
        actions.retry();
        return;
      }
      if (e.code === "KeyC") {
        actions.camera();
        return;
      }
      if (e.code === "KeyV") {
        actions.radio();
        return;
      }
      if (e.code === "KeyI") {
        actions.instrument();
        return;
      }
      if (game.paused || this.readOnly()) return;
      this.held.add(e.code);
      const c = game.controls;
      if (e.code === "Space") {
        c.port = 0;
        c.starboard = 0;
      }
      if (e.code === "KeyX") c.rudder = 0;
      // W/S and ↑/↓ move both levers together.
      const both = { KeyW: 0.2, ArrowUp: 0.2, KeyS: -0.2, ArrowDown: -0.2 }[
        e.code
      ];
      const port = { KeyQ: 0.2, KeyA: -0.2 }[e.code] ?? both;
      const starboard = { KeyE: 0.2, KeyD: -0.2 }[e.code] ?? both;
      if (port) c.port = clamp(c.port + port, -1, 1);
      if (starboard) c.starboard = clamp(c.starboard + starboard, -1, 1);
      game.observe(); // Capture every lever command, even multiple taps in one frame.
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
  }
  setSession(game: Session) {
    this.clear();
    this.game = game;
  }
  tick(dt: number) {
    if (this.readOnly()) return;
    const direction =
      Number(this.held.has("ArrowRight")) - Number(this.held.has("ArrowLeft"));
    this.game.controls.rudder = clamp(
      this.game.controls.rudder + direction * 0.32 * dt,
      -this.game.tuning.maxRudder,
      this.game.tuning.maxRudder,
    );
  }
  clear() {
    this.held.clear();
  }
}
