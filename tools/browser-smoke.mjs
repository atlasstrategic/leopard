// Optional test dependency; never shipped with the game.
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
const page =
  (await browser.pages()).find((p) =>
    p.url().startsWith("http://127.0.0.1:5174"),
  ) || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:5174", { waitUntil: "domcontentloaded" });
await page.bringToFront();
await page.waitForSelector("#retry");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (id) => page.$eval("#" + id, (el) => el.textContent);
await page.click("#retry");
// Use actual key events, not direct state mutation.
await page.keyboard.press("KeyQ");
await page.keyboard.press("KeyE");
await delay(250);
assert.match(await text("portValue"), /AHEAD 20/);
assert.match(await text("starboardValue"), /AHEAD 20/);
await page.keyboard.down("ArrowRight");
await delay(800);
await page.keyboard.up("ArrowRight");
await delay(100);
const rudder = await text("rudder");
assert.match(rudder, /S/);
await delay(500);
assert.equal(await text("rudder"), rudder);
await page.keyboard.press("KeyX");
await page.keyboard.press("Space");
await delay(150);
assert.match(await text("portValue"), /NEUTRAL/);
assert.match(await text("rudder"), /0°/);
await page.click('[data-engine="port"][data-value="-1"]');
await delay(150);
assert.match(await text("portValue"), /ASTERN 20/);
await page.click("#retry");
await page.click('[data-engine="port"][data-value="1"]');
await page.click('[data-engine="starboard"][data-value="1"]');
await delay(4000);
const movingSpeed = await text("speed");
assert.ok(parseFloat(movingSpeed) > 0.15);
await page.click("#neutral");
await delay(300);
const coastingSpeed = await text("speed");
assert.ok(parseFloat(coastingSpeed) > 0.15);
await page.click("#camera");
await delay(300);
assert.match(await text("camera"), /Overhead/);
await page.screenshot({ path: "artifacts/overhead.png" });
await page.click("#camera");
await delay(300);
assert.match(await text("camera"), /Helm/);
await page.screenshot({ path: "artifacts/helm.png" });
// Blur during held wheel, then release while out of focus. Resume must not keep turning.
await page.keyboard.down("ArrowLeft");
await delay(200);
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
await page.keyboard.up("ArrowLeft");
await delay(150);
assert.equal(await page.$eval("#paused", (el) => el.hidden), false);
const pausedTime = await text("time");
await delay(350);
assert.equal(await text("time"), pausedTime);
await page.click("#resume");
await delay(100);
const afterResume = await text("rudder");
await delay(400);
assert.equal(await text("rudder"), afterResume);
await page.click("summary");
await page.$eval("#windSpeed", (e) => {
  e.value = "6";
  e.dispatchEvent(new Event("input", { bubbles: true }));
});
await delay(150);
assert.match(await text("windSpeedValue"), /6.0 m\/s/);
await page.$eval("#windDirection", (e) => {
  e.value = "45";
  e.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.click("summary");
await page.click("#wind-true");
await delay(150);
assert.match(await text("wind"), /11.7 kn/);
assert.equal(await text("wind-from"), "045° T");
assert.equal(await text("wind-speed-label"), "TWS");
assert.equal(
  await page.$eval("#wind-true", (e) => e.getAttribute("aria-pressed")),
  "true",
);
await page.click("#wind-apparent");
await delay(150);
assert.equal(await text("wind-speed-label"), "AWS");
assert.ok(
  await page.$eval(".instruments", (e) =>
    e.classList.contains("helm-instruments"),
  ),
);
await page.click("summary");
await page.click("#defaults");
await page.click("summary");
await page.click("#retry");
await delay(150);
assert.match(await text("portValue"), /NEUTRAL/);
assert.match(await text("penalties"), /CONTACTS 0/);
assert.match(await text("rudder"), /0°/);
await page.click("#camera");
await delay(200);
await page.screenshot({ path: "artifacts/chase.png" });
// At the supported minimum desktop size, instruments must clear the levers.
await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
await delay(150);
assert.ok(
  await page.evaluate(
    () =>
      document.querySelector(".instruments").getBoundingClientRect().bottom <
      document.querySelector("footer").getBoundingClientRect().top,
  ),
);
await page.screenshot({ path: "artifacts/instruments-compact.png" });
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
assert.deepEqual(errors, []);
console.log(
  JSON.stringify(
    {
      browser: await browser.version(),
      viewport: "1440x1000",
      keyboardLevers: "pass",
      clickableLevers: "pass",
      persistentWheelAndCenter: "pass",
      neutralCoasting: { movingSpeed, coastingSpeed },
      cameras: "3 rendered",
      blurPauseClear: "pass",
      tuning: "pass",
      instruments:
        "apparent/true selection, knots, wind-from conversion, larger helm layout and 1100x760 clearance passed",
      retry: "pass",
      consoleErrors: errors,
    },
    null,
    2,
  ),
);
await browser.disconnect();
