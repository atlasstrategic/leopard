// Focused regression: real delayed mouse clicks, both sides, retrieval/pause,
// and a live-secured UI fixture (not a claim of completing the mission).
const { default: puppeteer } = await import(
  process.env.PUPPETEER_MODULE || "puppeteer-core"
);
import assert from "node:assert/strict";
const browser = await puppeteer.connect({
  browserURL: "http://localhost:9222",
  defaultViewport: null,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await page.setViewport({ width: 1100, height: 760 });
  await page.goto("http://127.0.0.1:5174", { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await page.waitForSelector("#retry");
  await page.click("#retry");
  await page.click("#crew-tab");
  for (const side of ["port", "starboard"]) {
    await page.click(`#fender-${side}`, { delay: 250 });
    assert.match(
      await page.$eval(`#fender-${side}`, (e) => e.textContent),
      /deploy/,
    );
  }
  await page.keyboard.press("KeyP");
  await delay(200);
  const stopped = await page.$eval("#fender-starboard", (e) => e.textContent);
  await delay(700);
  assert.equal(
    await page.$eval("#fender-starboard", (e) => e.textContent),
    stopped,
  );
  await page.click("#resume");
  await page.waitForFunction(
    () =>
      ["port", "starboard"].every(
        (s) =>
          document
            .querySelector(`#fender-${s}`)
            .getAttribute("aria-pressed") === "true",
      ),
    { timeout: 15000 },
  );
  for (const side of ["port", "starboard"])
    await page.click(`#fender-${side}`, { delay: 250 });
  await page.waitForFunction(
    () =>
      ["port", "starboard"].every((s) =>
        document.querySelector(`#fender-${s}`).textContent.endsWith("stowed"),
      ),
    { timeout: 15000 },
  );
  // Construct an isolated real Session/LogUI fixture in the test-only page.
  await page.evaluate(async () => {
    const { Session } = await import("/src/session.ts");
    const { LogUI, crewMarkup, logMarkup } = await import("/src/log-ui.ts");
    const root = document.createElement("section");
    root.id = "fixture";
    root.style.cssText =
      "position:fixed;inset:0;background:#102d3a;z-index:100;padding:40px;";
    root.innerHTML = crewMarkup + logMarkup;
    document.body.append(root);
    const game = new Session();
    game.progress.success = true;
    game.progress.phase = "secured";
    const ui = new LogUI(root, game, () => {
      game.paused = !game.paused;
    });
    ui.update();
    window.fenderFixture = { game, ui };
  });
  assert.doesNotMatch(
    await page.$eval("#fixture #crew-status", (e) => e.textContent),
    /Retry/,
  );
  await page.click("#fixture #fender-port", { delay: 250 });
  assert.match(
    await page.$eval("#fixture #crew-status", (e) => e.textContent),
    /deploying/,
  );
  assert.equal(
    await page.evaluate(() => window.fenderFixture.game.fenders.port.remaining),
    3,
  );
  await page.evaluate(() => {
    const { game, ui } = window.fenderFixture;
    game.retry();
    ui.update();
  });
  await page.click("#fixture #fender-port", { delay: 250 });
  assert.match(
    await page.$eval("#fixture #crew-status", (e) => e.textContent),
    /deploying/,
  );
  assert.equal(
    await page.evaluate(() => window.fenderFixture.game.fenders.port.remaining),
    3,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        browser: await browser.version(),
        viewport: "1100x760",
        delayedClicksBothSides: "pass",
        deployRetrieve: "pass",
        pauseFreezesCrew: "pass",
        liveSecuredFixtureCrewControls: "pass",
        retryRestoresControl: "pass",
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await page.close();
  await browser.disconnect();
}
