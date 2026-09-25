// UI-only approach → line attachment → live secured → release regression.
const { default: puppeteer } = await import(
  process.env.PUPPETEER_MODULE || "puppeteer-core"
);
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
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
try {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:5174", { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await page.waitForSelector("#retry");
  await page.click("#retry");
  await page.click("#crew-tab");
  await page.click("#line-bow");
  assert.match(
    await page.$eval("#line-feedback", (e) => e.textContent),
    /First hold/,
  );
  await page.click("#fender-starboard");
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    window.downloadBlobs = [];
    URL.createObjectURL = (blob) => {
      window.downloadBlobs.push(blob);
      return create(blob);
    };
    document.querySelector("#windSpeed").value = "0";
    document.querySelector("#windSpeed").dispatchEvent(new Event("input"));
    let y = -22,
      last = 0,
      next = 0;
    const throttle = (v) => {
      for (const id of ["port", "starboard"]) {
        const el = document.querySelector("#" + id);
        el.value = String(v);
        el.dispatchEvent(new Event("input"));
      }
    };
    window.dockPilot = setInterval(() => {
      const t = parseFloat(
        document.querySelector("#time").textContent.replace("TIME ", ""),
      );
      if (
        !document.querySelector("#mission-phase").textContent.startsWith("01")
      ) {
        throttle(0);
        clearInterval(window.dockPilot);
        return;
      }
      const speed =
        parseFloat(document.querySelector("#speed").textContent) / 1.943844;
      if (t < last) last = t;
      y += speed * (t - last);
      last = t;
      if (t < next) return;
      next = t + 0.4;
      const desired = Math.max(-1, Math.min(1, (16 - y) * 0.18));
      throttle(
        Math.round(Math.max(-1, Math.min(1, (desired - speed) * 1.4)) * 5) * 20,
      );
      if (t > 100) clearInterval(window.dockPilot);
    }, 30);
  });
  await page.waitForFunction(
    () => document.querySelector("#mission-phase").textContent.startsWith("02"),
    { timeout: 150000, polling: 200 },
  );
  await page.click("#neutral");
  for (const id of ["bow", "stern"]) {
    await page.click("#line-" + id, { delay: 150 });
    assert.match(
      await page.$eval("#line-" + id, (e) => e.textContent),
      /Release/,
    );
  }
  await page.waitForFunction(
    () => document.querySelector("#mission-phase").textContent.startsWith("03"),
    { timeout: 20000, polling: 100 },
  );
  const result = await page.$eval("#result", (e) => e.textContent),
    collisions = await page.$eval("#penalties", (e) => e.textContent);
  assert.match(collisions, /CONTACTS 0/);
  const clock = await page.$eval("#time", (e) => e.textContent);
  await new Promise((r) => setTimeout(r, 600));
  assert.notEqual(await page.$eval("#time", (e) => e.textContent), clock);
  await page.screenshot({ path: "artifacts/mooring-secured.png" });
  await page.click("#line-bow", { delay: 150 });
  await page.waitForFunction(() =>
    document.querySelector("#mission-phase").textContent.startsWith("02"),
  );
  assert.match(await page.$eval("#line-bow", (e) => e.textContent), /Attach/);
  await page.click("#line-bow");
  await page.waitForFunction(
    () => document.querySelector("#mission-phase").textContent.startsWith("03"),
    { timeout: 20000 },
  );
  await page.click("#fender-port");
  assert.match(
    await page.$eval("#fender-port", (e) => e.textContent),
    /deploy/,
  );
  await page.click("#open-log");
  await page.select("#log-filter", "lines");
  await page.screenshot({ path: "artifacts/mooring-log.png" });
  await page.click("#export-json");
  const json = await page.evaluate(
    async () => await window.downloadBlobs.at(-1).text(),
  );
  const recording = JSON.parse(json);
  for (const type of [
    "line.rejected",
    "line.attach",
    "line.release",
    "mission.securing",
    "mission.secured",
    "mission.unsecured",
  ])
    assert.ok(
      recording.events.some((e) => e.type === type),
      type,
    );
  assert.ok(recording.snapshots.some((s) => s.data.mooring?.bow.attached));
  await writeFile("artifacts/mooring-recording.json", json);
  await page.click("#close-log");
  await page.click("#resume");
  await page.click("#retry");
  await page.waitForFunction(() =>
    document.querySelector("#line-bow").textContent.startsWith("Attach"),
  );
  await page.click("#open-log");
  await page.select("#log-attempt", String(recording.attempt));
  await page.click("#export-json");
  const archived = await page.evaluate(async () =>
    JSON.parse(await window.downloadBlobs.at(-1).text()),
  );
  assert.equal(archived.events.at(-1).type, "attempt.end");
  assert.ok(archived.events.some((e) => e.type === "line.attach"));
  await page.click("#close-log");
  await page.click("#resume");
  await page.click("#objective-tab");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        browser: await browser.version(),
        result,
        collisions,
        method:
          "UI-only calm approach with HUD speed/time integration; no pose injection",
        attachBoth: "pass",
        liveSecured: "pass",
        releaseRevokesSecured: "pass",
        reattachAndSecure: "pass",
        crewStillLive: "pass",
        lineEventsAndTelemetryExport: "pass",
        retryArchive: "pass",
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await page.evaluate(() => clearInterval(window.dockPilot)).catch(() => {});
  await browser.disconnect();
}
