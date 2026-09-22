import { clamp } from "./simulation";
import type { Session } from "./session";
export class Input {
  held = new Set<string>();
  constructor(
    private game: Session,
    private actions: {
      camera: () => void;
      retry: () => void;
      pause: () => void;
    },
  ) {
    window.addEventListener("keydown", (e) => {
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
        "ArrowLeft",
        "ArrowRight",
        "KeyX",
        "Space",
        "KeyC",
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
      if (game.paused || game.progress.success) return;
      this.held.add(e.code);
      const c = game.controls;
      if (e.code === "Space") {
        c.port = 0;
        c.starboard = 0;
      }
      if (e.code === "KeyX") c.rudder = 0;
      if (["KeyQ", "KeyA", "KeyW", "KeyS"].includes(e.code))
        c.port = clamp(
          c.port + (["KeyQ", "KeyW"].includes(e.code) ? 0.2 : -0.2),
          -1,
          1,
        );
      if (["KeyE", "KeyD", "KeyW", "KeyS"].includes(e.code))
        c.starboard = clamp(
          c.starboard + (["KeyE", "KeyW"].includes(e.code) ? 0.2 : -0.2),
          -1,
          1,
        );
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
  }
  tick(dt: number) {
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
