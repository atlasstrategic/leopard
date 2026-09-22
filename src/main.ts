import "./style.css";
import { STEP } from "./config";
import { View, hasWebGL2, type CameraMode } from "./rendering";
import { Session } from "./session";
import { Input } from "./input";
import { UI } from "./ui";
const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
function error(message: string) {
  document.querySelector("#ui")!.innerHTML = "";
  canvas.style.display = "none";
  const panel = document.createElement("div");
  panel.className = "error";
  const title = document.createElement("h1");
  title.textContent = "The harbour needs WebGL 2.";
  const text = document.createElement("p");
  text.textContent = message;
  panel.append(title, text);
  document.body.append(panel);
}
if (!hasWebGL2()) {
  error(
    "Your browser could not create a WebGL 2 context. Enable hardware acceleration and update your browser/graphics driver, then reload. Try current desktop Chrome or Firefox. No data has been lost.",
  );
} else {
  try {
    const game = new Session(),
      view = new View(canvas);
    const modes: CameraMode[] = ["chase", "overhead", "helm"];
    const actions = {
      camera: () => {
        view.mode = modes[(modes.indexOf(view.mode) + 1) % modes.length];
      },
      retry: () => {
        input.clear();
        game.retry();
      },
      pause: () => {
        input.clear();
        game.paused = !game.paused;
        game.clock.reset();
        game.previous = { ...game.state };
      },
    };
    const input = new Input(game, actions),
      ui = new UI(game, view, actions);
    const suspend = () => {
      input.clear();
      game.paused = true;
      game.clock.reset();
      game.previous = { ...game.state };
      ui.update();
    };
    window.addEventListener("blur", suspend);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) suspend();
    });
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      suspend();
      error(
        "The graphics context was lost. Reload this page to restart the local prototype; try closing other GPU-heavy tabs first.",
      );
    });
    let last = performance.now(),
      uiTime = 0;
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const alpha = game.paused
        ? 1
        : game.clock.advance(dt, () => {
            if (!game.progress.success) input.tick(STEP);
            game.tick();
          });
      view.render(game.interpolated(alpha), now / 1000, game.progress.dwell);
      uiTime += dt;
      if (uiTime > 1 / 15) {
        ui.update();
        uiTime = 0;
      }
      requestAnimationFrame(frame);
    };
    ui.update();
    requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    error(
      `Graphics initialization failed: ${e instanceof Error ? e.message : String(e)}. Try a current browser with hardware acceleration enabled.`,
    );
  }
}
