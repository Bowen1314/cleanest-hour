// Prints the impact numbers quoted in README.md and the Devpost write-up, computed with the
// same functions the app uses. Usage: node scripts/impact_table.mjs
import { readFileSync } from "node:fs";
import { prepareSeries, evaluate, hourLabel } from "../js/calc.js";

const APPL = [
  ["Dishwasher", 1.1, 2, 4], ["Clothes washer", 0.4, 1, 4], ["Electric dryer", 2.2, 1, 3],
  ["EV charging (40 mi)", 14, 2, 5], ["Water heater boost", 4.5, 1, 7],
];
const ISOS = ["PJM", "MISO", "ERCO", "CISO", "SWPP", "NYIS", "ISNE"];
const load = (ba) => prepareSeries(JSON.parse(readFileSync(new URL(`../data/${ba}.json`, import.meta.url))));
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

console.log("## PJM (New Jersey), usual start 7 pm, any time allowed, all year\n");
console.log("| Appliance | kWh/run | Runs/wk | Cleanest start | kg/run at 7 pm | kg/run at best | Saving | kg CO2e/yr saved | Cleaner on |");
console.log("|---|---|---|---|---|---|---|---|---|");
const pjm = load("PJM");
let tot = 0, totUsual = 0;
for (const [n, kwh, h, runs] of APPL) {
  const r = evaluate(pjm, { kwh, hours: h, usual: 19, runsPerWeek: runs });
  tot += r.yearlySaveKg; totUsual += r.yearlyUsualKg;
  console.log(`| ${n} | ${kwh} | ${runs} | ${hourLabel(r.best)} | ${f2(r.usualKg)} | ${f2(r.bestKg)} | ${Math.round(r.savePct)}% | ${f1(r.yearlySaveKg)} | ${Math.round(r.winShare * 100)}% of ${r.days} days |`);
}
console.log(`\nAll five together: ${f1(tot)} kg CO2e/yr saved out of ${f1(totUsual)} kg (${Math.round(100 * tot / totUsual)}%).`);
const ov = evaluate(pjm, { kwh: 14, hours: 2, usual: 19, runsPerWeek: 5, window: { from: 22, until: 7 } });
console.log(`PJM EV restricted to overnight (10 pm-7 am): start ${hourLabel(ov.best)}, ${Math.round(ov.savePct)}%, ${f1(ov.yearlySaveKg)} kg/yr, cleaner on ${Math.round(ov.winShare * 100)}% of days.\n`);

console.log("## EV charging (14 kWh, 2 h, 5x/week, usual 7 pm) across the seven ISOs\n");
console.log("| Grid | Cleanest start (any time) | Saving | kg/yr | Cleaner on | Overnight-only best | Overnight saving | Overnight kg/yr |");
console.log("|---|---|---|---|---|---|---|---|");
for (const ba of ISOS) {
  const s = load(ba);
  const a = evaluate(s, { kwh: 14, hours: 2, usual: 19, runsPerWeek: 5 });
  const o = evaluate(s, { kwh: 14, hours: 2, usual: 19, runsPerWeek: 5, window: { from: 22, until: 7 } });
  console.log(`| ${ba} | ${hourLabel(a.best)} | ${Math.round(a.savePct)}% | ${f1(a.yearlySaveKg)} | ${Math.round(a.winShare * 100)}% | ${hourLabel(o.best)} | ${Math.round(o.savePct)}% | ${f1(o.yearlySaveKg)} |`);
}
