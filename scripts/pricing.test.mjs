import assert from "node:assert/strict";
import { test } from "node:test";
import { phaseAt, pricingState } from "../shared/pricing.ts";

function stateAt(iso) {
  return pricingState(Date.parse(iso));
}

function nextChangeAt(iso) {
  return stateAt(iso).nextChangeAt.toISOString();
}

test("phase edges follow the two UTC peak windows", () => {
  assert.equal(phaseAt(Date.parse("2026-03-02T00:59:00Z")), "offPeak");
  assert.equal(phaseAt(Date.parse("2026-03-02T01:00:00Z")), "peak");
  assert.equal(phaseAt(Date.parse("2026-03-02T03:59:00Z")), "peak");
  assert.equal(phaseAt(Date.parse("2026-03-02T04:00:00Z")), "offPeak");
  assert.equal(phaseAt(Date.parse("2026-03-02T05:59:00Z")), "offPeak");
  assert.equal(phaseAt(Date.parse("2026-03-02T06:00:00Z")), "peak");
  assert.equal(phaseAt(Date.parse("2026-03-02T09:59:00Z")), "peak");
  assert.equal(phaseAt(Date.parse("2026-03-02T10:00:00Z")), "offPeak");
});

test("next change lands on the next window edge", () => {
  const cases = [
    ["2026-03-02T00:30:00Z", "2026-03-02T01:00:00.000Z"],
    ["2026-03-02T01:00:00Z", "2026-03-02T04:00:00.000Z"],
    ["2026-03-02T03:59:30Z", "2026-03-02T04:00:00.000Z"],
    ["2026-03-02T04:00:00Z", "2026-03-02T06:00:00.000Z"],
    ["2026-03-02T06:00:00Z", "2026-03-02T10:00:00.000Z"],
    ["2026-03-02T09:59:30Z", "2026-03-02T10:00:00.000Z"],
    ["2026-03-02T10:00:00Z", "2026-03-03T01:00:00.000Z"],
    ["2026-03-06T10:00:00Z", "2026-03-09T01:00:00.000Z"],
    ["2026-03-07T12:00:00Z", "2026-03-09T01:00:00.000Z"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(nextChangeAt(input), expected, input);
  }
});

test("a nine-day Spring Festival does not stall at the next minute", () => {
  const state = stateAt("2026-02-16T12:00:00Z");
  assert.equal(state.phase, "offPeak");
  assert.equal(state.reason, "holiday");
  assert.equal(state.nextChangeAt.toISOString(), "2026-02-24T01:00:00.000Z");
});

test("the National Day edge crosses the old seven-day cap", () => {
  const state = stateAt("2026-10-01T00:00:00Z");
  assert.equal(state.phase, "offPeak");
  assert.equal(state.reason, "holiday");
  assert.equal(state.nextChangeAt.toISOString(), "2026-10-08T01:00:00.000Z");
});

test("a peak-shaped holiday window is off-peak", () => {
  // 2026-02-17 is a Tuesday inside Spring Festival; 02:00 UTC would be peak on a normal weekday.
  assert.equal(phaseAt(Date.parse("2026-02-17T02:00:00Z")), "offPeak");
  assert.equal(phaseAt(Date.parse("2026-10-02T02:00:00Z")), "offPeak");
});

test("weekend reasoning uses the UTC weekday, not the Beijing date", () => {
  // 23:00 UTC Friday is already Saturday in Beijing, but still a UTC weekday.
  assert.equal(stateAt("2026-03-06T23:00:00Z").reason, "outsideWindow");
  assert.equal(stateAt("2026-03-07T00:00:00Z").reason, "weekend");
  assert.equal(stateAt("2026-03-08T23:00:00Z").reason, "weekend");
  assert.equal(stateAt("2026-03-09T00:00:00Z").reason, "outsideWindow");
});
