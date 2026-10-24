// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  prepareSeries, filterDays, runIntensity, allowedStarts, evaluate, evaluateProfile,
  hourlyProfile, hourLabel, buildICS, weeklyDays,
} from "../js/calc.js";

// synthetic region: 14 days starting Monday 2026-0105; intensity = 100 + 10*h, except hour 3 is 0
function synth(days = 14, start = "2026-01-05") {
  const ci = [];
  for (let d = 0; d < days; d++) ci.push([...Array(24).keys()].map((h) => (h === 3 ? 0 : 100 + 10 * h)));
  return { start, ci };
}

test("prepareSeries fills nulls with the hour mean and tags days", () => {
  const f = synth(3);
  f.ci[1][5] = null;
  const s = prepareSeries(f);
  assert.equal(s.filled, 1);
  assert.equal(s.flat[24 + 5], 150);
  assert.equal(s.meta[0].iso, "2026-01-05");
  assert.equal(s.meta[0].season, "winter");
  assert.equal(s.meta[0].weekend, false);
  const sat = prepareSeries(synth(7)).meta[5];
  assert.equal(sat.weekend, true);
});

test("filterDays by season and day type", () => {
  const s = prepareSeries(synth(14));
  assert.equal(filterDays(s, "all", "weekday").length, 10);
  assert.equal(filterDays(s, "all", "weekend").length, 4);
  assert.equal(filterDays(s, "summer", "all").length, 0);
});

test("runIntensity handles fractional runs and midnight crossing", () => {
  const s = prepareSeries(synth(3));
  assert.equal(runIntensity(s.flat, 0, 10, 1), 200);
  assert.equal(runIntensity(s.flat, 0, 10, 2), 205);
  // 1.5 h from 10:00 -> (200*1 + 210*0.5)/1.5
  assert.ok(Math.abs(runIntensity(s.flat, 0, 10, 1.5) - (200 + 105) / 1.5) < 1e-9);
  // 23:00 for 2 h -> 330 then next day's 00:00 (100)
  assert.equal(runIntensity(s.flat, 0, 23, 2), 215);
  // past the end of data
  assert.ok(Number.isNaN(runIntensity(s.flat, 2, 23, 2)));
});

test("allowedStarts respects windows that wrap midnight", () => {
  assert.equal(allowedStarts(2, null).length, 24);
  assert.deepEqual(allowedStarts(2, { from: 22, until: 7 }), [22, 23, 0, 1, 2, 3, 4, 5]);
  assert.deepEqual(allowedStarts(9, { from: 8, until: 17 }), [8]);
  assert.deepEqual(allowedStarts(10, { from: 8, until: 17 }), []);
});

test("evaluate picks the cleanest start and quantifies savings", () => {
  const s = prepareSeries(synth(14));
  const r = evaluate(s, { kwh: 2, hours: 1, usual: 19, runsPerWeek: 7 });
  assert.equal(r.best, 3);
  assert.equal(r.bestKg, 0);
  assert.ok(Math.abs(r.usualKg - (290 * 2) / 1000) < 1e-12);
  assert.equal(r.savePct, 100);
  assert.equal(r.winShare, 1);
  assert.ok(Math.abs(r.yearlySaveKg - 0.58 * 7 * 365.25 / 7) < 1e-9);
  // restricted window excludes hour 3
  const w = evaluate(s, { kwh: 2, hours: 1, usual: 19, window: { from: 8, until: 17 } });
  assert.equal(w.best, 8);
  // usual already best -> zero saving
  const z = evaluate(s, { kwh: 1, hours: 1, usual: 3 });
  assert.equal(z.saveKg, 0);
});

test("evaluateProfile agrees with evaluate on a constant-shape series", () => {
  const s = prepareSeries(synth(14));
  const prof = hourlyProfile(s, filterDays(s)).mean;
  const a = evaluate(s, { kwh: 3, hours: 2, usual: 18 });
  const b = evaluateProfile(prof, { kwh: 3, hours: 2, usual: 18 });
  assert.equal(a.best, b.best);
  assert.ok(Math.abs(a.saveKg - b.saveKg) < 1e-9);
});

test("labels and calendar", () => {
  assert.equal(hourLabel(0), "12 am");
  assert.equal(hourLabel(12), "12 pm");
  assert.equal(hourLabel(19), "7 pm");
  assert.equal(hourLabel(24), "12 am");
  assert.deepEqual(weeklyDays(3), ["MO", "WE", "FR"]);
  const ics = buildICS({ title: "Run dishwasher", description: "Saves 0.1 kg, maybe", startHour: 1, hours: 2, runsPerWeek: 3, now: new Date(2026, 9, 24, 12) });
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR/);
  assert.match(ics, /DTSTART:20261026T010000/); // 2026-10-24 is Saturday -> first MO/WE/FR is Mon 26th
  assert.match(ics, /DESCRIPTION:Saves 0.1 kg\\, maybe/);
  for (const line of ics.split("\r\n")) assert.ok(line.length <= 75);
});

test("real data files are well formed", () => {
  const index = JSON.parse(readFileSync(new URL("../data/index.json", import.meta.url)));
  assert.ok(index.regions.length >= 7);
  for (const code of ["PJM", "CISO", "ERCO", "MISO", "NYIS", "ISNE", "SWPP"]) {
    const reg = index.regions.find((r) => r.ba === code);
    assert.ok(reg, code + " in index");
    const f = JSON.parse(readFileSync(new URL(`../data/${code}.json`, import.meta.url)));
    assert.equal(f.ci.length, index.dateRange.days);
    assert.ok(f.ci.every((d) => d.length === 24));
    const vals = f.ci.flat().filter((v) => v != null);
    assert.ok(vals.every((v) => v >= 0 && v < 1200), code + " intensity in range");
    // generation-weighted 12-month mean within a factor of 2 of eGRID2023's annual BA rate
    const ratio = reg.annualAvg_g_per_kwh / reg.egrid2023Avg_g_per_kwh;
    assert.ok(ratio > 0.5 && ratio < 2, `${code} vs eGRID ratio ${ratio}`);
  }
  // CAISO's cleanest hours must be midday (solar), a sanity check on hour alignment
  const ciso = index.regions.find((r) => r.ba === "CISO").profileAll;
  const minH = ciso.indexOf(Math.min(...ciso));
  assert.ok(minH >= 9 && minH <= 15, "CISO cleanest hour " + minH);
});
