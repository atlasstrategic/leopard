import { test } from "node:test";
import assert from "node:assert/strict";
import { instrumentData, bearingText } from "../src/instrument-data";
import { initialState, initialWeather } from "../src/simulation";
import { knots } from "../src/config";
const target = { x: 0, y: 16 };
const close = (a: number | null, b: number) => {
  assert.notEqual(a, null);
  assert.ok(Math.abs(a! - b) < 1e-8, `${a} != ${b}`);
};

test("east-going wind is FROM west, on port side of a north-facing boat", () => {
  const d = instrumentData(initialState(), initialWeather(), target);
  close(d.true.from, (3 * Math.PI) / 2);
  close(d.apparent.relative, -Math.PI / 2);
  close(d.true.speed, knots(2));
  close(d.apparent.speed, d.true.speed);
});
test("rotation changes relative wind angle without changing true bearing or speed", () => {
  const d = instrumentData(
    { ...initialState(), heading: Math.PI / 2 },
    initialWeather(),
    target,
  );
  close(Math.abs(d.true.relative!), Math.PI);
  close(d.true.from, (3 * Math.PI) / 2);
  close(d.true.speed, knots(2));
});
test("headway in calm air creates apparent wind from the bow; reverse creates stern wind", () => {
  const weather = { ...initialWeather(), speed: 0 };
  const forward = instrumentData({ ...initialState(), vy: 2 }, weather, target);
  close(forward.apparent.relative, 0);
  close(forward.apparent.speed, knots(2));
  assert.equal(forward.true.from, null);
  assert.equal(forward.true.relative, null);
  const reverse = instrumentData(
    { ...initialState(), vy: -2 },
    weather,
    target,
  );
  close(Math.abs(reverse.apparent.relative!), Math.PI);
  close(reverse.course, Math.PI);
  close(reverse.heading, 0);
});
test("apparent wind includes crosswind and vessel velocity as vectors", () => {
  const d = instrumentData(
    { ...initialState(), vy: 2 },
    initialWeather(),
    target,
  );
  close(d.apparent.speed, knots(Math.sqrt(8)));
  close(d.apparent.relative, -Math.PI / 4);
  close(d.true.speed, knots(2));
});
test("true wind is water-relative with current; apparent is boat-relative", () => {
  const d = instrumentData(
    { ...initialState(), vx: 2 },
    { ...initialWeather(), currentX: 1 },
    target,
  );
  close(d.true.speed, knots(1));
  assert.equal(d.apparent.from, null);
  close(d.apparent.speed, 0);
});
test("heading, course and berth bearing are separate quantities; low-speed COG is suppressed", () => {
  const d = instrumentData(
    { ...initialState(), vx: 1 },
    initialWeather(),
    target,
  );
  close(d.heading, 0);
  close(d.course, Math.PI / 2);
  close(d.bearing, 0);
  const stopped = instrumentData(
    { ...initialState(), vx: 0.01 },
    initialWeather(),
    target,
  );
  assert.equal(stopped.course, null);
  const arrived = instrumentData(
    { ...initialState(), ...target },
    initialWeather(),
    target,
  );
  assert.equal(arrived.bearing, null);
});
test("bearings wrap cleanly, including rounded north, negatives and multiple revolutions", () => {
  assert.equal(bearingText((359.8 * Math.PI) / 180), "000° T");
  assert.equal(bearingText(-Math.PI / 2), "270° T");
  assert.equal(bearingText((5 * Math.PI) / 2), "090° T");
  assert.equal(bearingText(null), "—");
});
