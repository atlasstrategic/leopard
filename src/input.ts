import { clamp } from "./simulation";
import type { Session } from "./session";
// The numpad as three lever columns, port · both · starboard: the top row
// (7 8 9) steps ahead, the bottom row (1 2 3) astern, the middle row (4 5 6)
// is neutral. Codes are physical keys, so this works with Num Lock off too.
const numpadLevers: Record<string, [number, number]> = {
  Numpad7: [0.2, 0],
  Numpad1: [-0.2, 0],
  Numpad8: [0.2, 0.2],
  Numpad2: [-0.2, -0.2],
  Numpad9: [0, 0.2],
  Numpad3: [0, -0.2],
};
const numpadNeutral: Record<string, { port: boolean; starboard: boolean }> = {
  Numpad4: { port: true, starboard: false },
  Numpad5: { port: true, starboard: true },
  Numpad6: { port: false, starboard: true },
};
export class Input {
  held = new Set<string>();
  constructor(
    private game: Session,
    private actions: {
      camera: () => void;
      radio: () => void;
      instrument: () => void;
      objective: () => void;
      keys: () => void;
      focus: () => void;
      retryKey: () => void;
      pause: () => void;
    },
    private readOnly: () => boolean = () => false,
  ) {
    // A button or slider clicked with the mouse hands keyboard focus back to
    // the game, so Space, the arrows and the letters keep steering the boat.
    // Keyboard users who Tab to a control keep it.
    window.addEventListener("pointerup", (e) => {
      const control = (e.target as Element).closest?.(
        'button, input[type="range"]',
      );
      if (control) setTimeout(() => (control as HTMLElement).blur());
    });
    window.addEventListener("keydown", (e) => {
      const game = this.game;
      const target = e.target as HTMLElement;
      const numpad = e.code in numpadLevers || e.code in numpadNeutral;
      // Typing in a field, a slider's own arrow keys, and Space or Enter on a
      // button reached with the keyboard keep their usual meaning; the numpad
      // always steers.
      if (
        target.matches?.('input:not([type="range"]), select, textarea') ||
        (!numpad &&
          target.matches?.('input[type="range"]') &&
          e.code.startsWith("Arrow")) ||
        (!numpad &&
          target.matches?.("button") &&
          ["Space", "Enter"].includes(e.code))
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
        "KeyO",
        "Slash",
        "KeyH",
        "KeyR",
        "KeyP",
      ];
      if (!valid.includes(e.code) && !numpad) return;
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === "KeyP") {
        actions.pause();
        return;
      }
      if (e.code === "KeyR") {
        actions.retryKey();
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
      if (e.code === "KeyO") {
        actions.objective();
        return;
      }
      // ? (Shift + / on most layouts) opens or closes the keys card.
      if (e.code === "Slash") {
        actions.keys();
        return;
      }
      if (e.code === "KeyH") {
        actions.focus();
        return;
      }
      if (this.readOnly()) return;
      const c = game.controls;
      // Neutral always works, even while paused: Space and Numpad 5 for both
      // engines, Numpad 4 and 6 for port and starboard.
      const neutral =
        e.code === "Space" ? numpadNeutral.Numpad5 : numpadNeutral[e.code];
      if (neutral) {
        if (neutral.port) c.port = 0;
        if (neutral.starboard) c.starboard = 0;
        game.observe();
        return;
      }
      if (game.paused) return;
      this.held.add(e.code);
      if (e.code === "KeyX") c.rudder = 0;
      // W/S and ↑/↓ move both levers together.
      const both = { KeyW: 0.2, ArrowUp: 0.2, KeyS: -0.2, ArrowDown: -0.2 }[
        e.code
      ];
      const [padPort, padStarboard] = numpadLevers[e.code] ?? [];
      const port = { KeyQ: 0.2, KeyA: -0.2 }[e.code] ?? both ?? padPort;
      const starboard =
        { KeyE: 0.2, KeyD: -0.2 }[e.code] ?? both ?? padStarboard;
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
