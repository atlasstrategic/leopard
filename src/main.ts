import "./style.css";
import { STEP, useStage } from "./config";
import { chooseStage } from "./stage/select";
import { View, hasWebGL2, type CameraMode } from "./rendering";
import { PracticeLab, showMeAvailable } from "./demonstration";
import { Input } from "./input";
import {
  toggleFocus,
  toggleKeys,
  toggleObjective,
  toggleRadio,
  toggleRadioShown,
  UI,
} from "./ui";
import { nextPage } from "./instruments";
import type { CheckpointId } from "./session";
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
    // Choose the stage before building anything that reads it.
    const choice = chooseStage(location.search);
    useStage(choice.stage);
    const lab = new PracticeLab(),
      view = new View(canvas);
    // Development-only handle for browser checks; absent from production builds.
    if (import.meta.env.DEV)
      Object.assign(window, { __leopard: { lab, view } });
    let ui!: UI;
    let practiceCamera: CameraMode = view.mode;
    let retryAsked = -Infinity;
    const modes: CameraMode[] = ["chase", "overhead", "helm"];
    const actions = {
      camera: () => {
        view.mode = modes[(modes.indexOf(view.mode) + 1) % modes.length];
      },
      radio: () => {
        toggleRadio(lab.active);
        ui.update();
      },
      // R is next to E and D, so during a run it asks for a second press;
      // after the mission ends (or fails) one press retries.
      retryKey: () => {
        const g = lab.active,
          over =
            g.progress.phase === "complete" || g.progress.phase === "failed",
          now = performance.now();
        if (over || lab.mode === "demo" || now - retryAsked < 2500) {
          retryAsked = -Infinity;
          ui.toast("");
          actions.retry();
        } else {
          retryAsked = now;
          ui.toast("Press R again to retry");
        }
      },
      instrument: () => {
        nextPage();
        ui.update();
      },
      objective: () => {
        toggleObjective();
        ui.update();
      },
      radioShown: () => {
        toggleRadioShown();
        ui.update();
      },
      keys: () => {
        toggleKeys();
        ui.update();
      },
      focus: () => {
        toggleFocus();
        ui.update();
      },
      retry: () => {
        input.clear();
        if (lab.mode === "demo") {
          lab.showMe();
          bindSession();
        } else lab.active.retry();
      },
      restartFrom: (id: CheckpointId) => {
        input.clear();
        if (lab.mode === "practice") lab.active.retry(id);
      },
      readOnly: () => lab.mode === "demo",
      stageNotice: choice.notice,
      showDemo: () => {
        if (!showMeAvailable()) return;
        input.clear();
        if (lab.mode === "practice") practiceCamera = view.mode;
        lab.showMe();
        view.mode = "overhead";
        bindSession();
      },
      takeOver: () => {
        input.clear();
        lab.takeOver();
        bindSession();
      },
      returnPractice: () => {
        input.clear();
        lab.returnToPractice();
        view.mode = practiceCamera;
        bindSession();
      },
      pause: () => {
        const game = lab.active;
        input.clear();
        game.paused = !game.paused;
        game.clock.reset();
        game.previous = { ...game.state };
      },
    };
    const input = new Input(lab.active, actions, actions.readOnly);
    const bindSession = () => {
      input.setSession(lab.active);
      ui = new UI(lab.active, view, actions, lab);
      ui.update();
    };
    bindSession();
    const suspend = () => {
      const game = lab.active;
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
      const game = lab.active;
      const dt = (now - last) / 1000;
      last = now;
      const alpha = game.paused
        ? 1
        : game.clock.advance(dt, () => {
            input.tick(STEP);
            lab.tick();
          });
      game.observe();
      view.render(
        game.interpolated(alpha),
        now / 1000,
        game.progress.dwell,
        game.fenders,
        game.mooring,
        game.progress.positionTarget,
        game.interpolatedTraffic(alpha),
        game.sceneMarks(),
      );
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
