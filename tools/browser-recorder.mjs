// Optional puppeteer-core dependency, as documented in README. Uses real UI only.
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
try {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:5174", { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await page.waitForSelector("#retry");
  await page.click("#retry");
  await page.click("#crew-tab");
  await page.evaluate(() => {
    // Capture exactly the Blob handed to the browser download, not game internals.
    const create = URL.createObjectURL.bind(URL);
    window.recordingDownloads = [];
    URL.createObjectURL = (blob) => {
      window.recordingDownloads.push(blob);
      return create(blob);
    };
    const wind = document.querySelector("#windSpeed");
    wind.value = "0";
    wind.dispatchEvent(new Event("input"));
    // Opposite commands inside one JS task must both be recorded, even though
    // no physics/render tick sees the intermediate lever position.
    const lever = document.querySelector("#port");
    for (const value of ["20", "0"]) {
      lever.value = value;
      lever.dispatchEvent(new Event("input"));
    }
  });
  await page.click("#fender-starboard");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#fender-starboard")
        .textContent.includes("deployed"),
    { timeout: 15000 },
  );
  await page.screenshot({ path: "artifacts/fenders-deployed.png" });
  await page.evaluate(() => {
    for (const id of ["port", "starboard"]) {
      const el = document.querySelector("#" + id);
      el.value = "100";
      el.dispatchEvent(new Event("input"));
    }
  });
  // Deliberately hit North quay bow-on: deployed side fenders must NOT protect this.
  await page.waitForFunction(
    () =>
      /CONTACTS [1-9]/.test(document.querySelector("#penalties").textContent),
    { timeout: 120000, polling: 200 },
  );
  await page.click("#neutral");
  await page.click("#open-log");
  await page.waitForSelector("#voyage-log[open]");
  assert.equal(await page.$eval("#paused", (el) => el.hidden), false);
  const clock = await page.$eval("#time", (el) => el.textContent);
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(await page.$eval("#time", (el) => el.textContent), clock);
  await page.select("#log-filter", "contact");
  await page.screenshot({ path: "artifacts/contact-log.png" });
  assert.match(
    await page.$eval("#log-events", (el) => el.textContent),
    /no fender coverage/,
  );
  await page.click("#export-json");
  const json = await page.evaluate(
    async () => await window.recordingDownloads.at(-1).text(),
  );
  const recording = JSON.parse(json);
  const contacts = recording.events.filter((e) => e.type === "contact");
  assert.ok(contacts.length > 0);
  assert.ok(
    contacts.every(
      (e) => e.data.obstacleId === "north-quay" && !e.data.fenderCovered,
    ),
  );
  assert.ok(
    contacts.some(
      (e) => e.data.estimatedPeakLoadN > 0 && e.data.totalNormalImpulseNs > 0,
    ),
  );
  assert.ok(recording.events.some((e) => e.type === "fender.complete"));
  assert.ok(
    recording.events.some(
      (e) => e.type === "engines.change" && e.data.port === 0.2,
    ),
  );
  assert.ok(contacts.some((e) => e.data.peakContact.fendersDeployed.starboard));
  assert.ok(recording.events.some((e) => e.type === "weather.change"));
  await writeFile("artifacts/contact-recording.json", json);
  await page.click("#export-csv");
  const csv = await page.evaluate(
    async () => await window.recordingDownloads.at(-1).text(),
  );
  assert.ok(
    csv.includes("north-quay") &&
      csv.includes("telemetry") &&
      csv.includes("estimated_peak_load_N"),
  );
  await writeFile("artifacts/contact-recording.csv", csv);
  await page.click("#close-log");
  assert.equal(await page.$eval("#paused", (el) => el.hidden), false);
  await page.click("#resume");
  await page.click("#retry");
  await page.waitForFunction(() =>
    document.querySelector("#fender-starboard").textContent.includes("stowed"),
  );
  await page.click("#open-log");
  await page.select("#log-attempt", String(recording.attempt));
  await page.click("#export-json");
  const archived = await page.evaluate(async () =>
    JSON.parse(await window.recordingDownloads.at(-1).text()),
  );
  assert.equal(archived.attempt, recording.attempt);
  assert.equal(archived.events.at(-1).type, "attempt.end");
  assert.ok(archived.events.some((e) => e.type === "contact"));
  await page.click("#close-log");
  await page.click("#resume");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        browser: await browser.version(),
        fenderCrew: "3s deployment verified",
        collision:
          "UI-only bow impact on North quay; side fenders correctly not covering",
        contactReports: contacts.length,
        exportedJSON: true,
        exportedCSV: true,
        pauseAndResume: "pass",
        retryHistoryAndFenderReset: "pass",
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.disconnect();
}
