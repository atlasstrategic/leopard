// Real browser UI regression for Show me and preservation of the original run.
const { default: puppeteer } = await import(
  process.env.PUPPETEER_MODULE || "puppeteer-core"
);
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
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
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:5174", { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await page.waitForSelector("#retry");
  await page.click("#retry");
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    window.lessonDownloads = [];
    URL.createObjectURL = (b) => {
      window.lessonDownloads.push(b);
      return create(b);
    };
  });
  await page.click("summary");
  await page.$eval("#windSpeed", (e) => {
    e.value = "6";
    e.dispatchEvent(new Event("input"));
  });
  await page.click("summary");
  await page.keyboard.press("KeyQ");
  await page.keyboard.press("KeyX");
  await page.click("#pause");
  await delay(150);
  const saved = await page.evaluate(() => ({
    time: document.querySelector("#time").textContent,
    port: document.querySelector("#portValue").textContent,
    wind: document.querySelector("#windSpeed").value,
  }));
  await page.click("#paused-show-me");
  await delay(200);
  assert.equal(await page.$eval("#windSpeed", (e) => e.value), "0");
  assert.equal(await page.$eval("#port", (e) => e.disabled), true);
  assert.match(
    await page.$eval("#demo-explanation", (e) => e.textContent),
    /saved separately/,
  );
  await page.click("#demo-pause");
  await delay(150);
  const stopped = await page.$eval("#time", (e) => e.textContent);
  await delay(500);
  assert.equal(await page.$eval("#time", (e) => e.textContent), stopped);
  await page.click("#demo-pause");
  await page.waitForFunction(
    () => document.querySelector("#demo-title").textContent.startsWith("7 /"),
    { timeout: 150000, polling: 200 },
  );
  await page.screenshot({ path: "artifacts/show-me-tending.png" });
  assert.match(
    await page.$eval("#mission-hint", (e) => e.textContent),
    /Amber/,
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#demo-title").textContent.startsWith("Secured"),
    { timeout: 90000, polling: 200 },
  );
  const result = await page.$eval("#result", (e) => e.textContent);
  assert.match(result, /Secured/);
  assert.match(
    await page.$eval("#penalties", (e) => e.textContent),
    /CONTACTS 0/,
  );
  await page.screenshot({ path: "artifacts/show-me-complete.png" });
  await page.click("#demo-takeover");
  assert.equal(await page.$eval("#demo-takeover", (e) => e.disabled), true);
  assert.equal(await page.$eval("#port", (e) => e.disabled), false);
  await page.click("#demo-pause");
  await page.click("#crew-tab");
  // Tending controls work in takeover; complete one bounded ease task.
  await page.click("#tend-bow-out");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#tend-bow-status")
        .textContent.includes("Adjustment complete"),
    { timeout: 15000 },
  );
  await page.click("#open-log");
  await page.select("#log-filter", "lines");
  await page.click("#export-json");
  const json = await page.evaluate(
    async () => await window.lessonDownloads.at(-1).text(),
  );
  const recording = JSON.parse(json);
  for (const type of [
    "demo.start",
    "demo.step",
    "demo.complete",
    "demo.takeover",
    "mission.target",
    "line.tend.command",
    "line.tend.complete",
    "mission.secured",
  ])
    assert.ok(
      recording.events.some((e) => e.type === type),
      type,
    );
  assert.ok(
    recording.events.some(
      (e) => e.type === "line.tend.command" && e.data.action === "out",
    ),
  );
  await writeFile("artifacts/show-me-recording.json", json);
  await page.click("#close-log");
  await page.click("#demo-return");
  await delay(150);
  assert.equal(await page.$eval("#paused", (e) => e.hidden), false);
  const restored = await page.evaluate(() => ({
    time: document.querySelector("#time").textContent,
    port: document.querySelector("#portValue").textContent,
    wind: document.querySelector("#windSpeed").value,
  }));
  assert.deepEqual(restored, saved);
  // Repeat starts clean and does not replace the saved original attempt.
  await page.click("#paused-show-me");
  await delay(250);
  await page.click("#demo-repeat");
  await delay(150);
  assert.match(
    await page.$eval("#demo-title", (e) => e.textContent),
    /^1 \/ Prepare/,
  );
  await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
  await delay(150);
  await page.screenshot({ path: "artifacts/show-me-compact.png" });
  await page.click("#demo-return");
  await delay(150);
  assert.equal(await page.$eval("#time", (e) => e.textContent), saved.time);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        browser: await browser.version(),
        result,
        pauseResume: "pass",
        readOnlyDemoControls: "pass",
        takeoverAndEase: "pass",
        returnRestoresSavedPractice: "pass",
        repeat: "pass",
        viewportChecks: ["1440x1000", "1100x760"],
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.disconnect();
}
