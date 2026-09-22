// Optional test dependency; no direct access to game state or test-only hooks.
const { default: puppeteer } = await import(
  process.env.PUPPETEER_MODULE || "puppeteer-core"
);
import { mkdir } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
import assert from "node:assert/strict";
const browser = await puppeteer.connect({
  browserURL: "http://localhost:9222",
  defaultViewport: null,
});
const page = (await browser.pages()).find((p) =>
  p.url().startsWith("http://127.0.0.1:5174"),
);
await page.bringToFront();
await page.evaluate(() => {
  document.querySelector("#windSpeed").value = "0";
  document.querySelector("#windSpeed").dispatchEvent(new Event("input"));
  document.querySelector("#retry").click();
  let y = -22,
    last = 0,
    next = 0;
  window.dockPilot = setInterval(() => {
    const t = parseFloat(
      document.querySelector("#time").textContent.replace("TIME ", ""),
    );
    const v =
      parseFloat(document.querySelector("#speed").textContent) / 1.943844;
    if (t < last) last = t;
    y += v * (t - last);
    last = t;
    if (t < next) return;
    next = t + 0.4;
    const desired = Math.max(-1, Math.min(1, (16 - y) * 0.18));
    const throttle =
      Math.round(Math.max(-1, Math.min(1, (desired - v) * 1.4)) * 5) * 20;
    for (const id of ["port", "starboard"]) {
      const el = document.querySelector("#" + id);
      el.value = String(throttle);
      el.dispatchEvent(new Event("input"));
    }
    if (
      document.querySelector("#result").textContent.includes("Berth held") ||
      t > 100
    ) {
      clearInterval(window.dockPilot);
      window.dockEstimate = y;
    }
  }, 30);
});
await page.waitForFunction(
  () => document.querySelector("#result").textContent.includes("Berth held"),
  { timeout: 150000, polling: 200 },
);
const result = await page.$eval("#result", (e) => e.textContent);
const collisions = await page.$eval("#penalties", (e) => e.textContent);
assert.match(collisions, /CONTACTS 0/);
await page.screenshot({ path: "artifacts/docking-success.png" });
console.log(
  JSON.stringify(
    {
      result,
      collisions,
      method:
        "Browser DOM controls only; calm-water approach using HUD speed/time integration, no simulation pose mutation",
    },
    null,
    2,
  ),
);
await page.evaluate(() => clearInterval(window.dockPilot));
await browser.disconnect();
