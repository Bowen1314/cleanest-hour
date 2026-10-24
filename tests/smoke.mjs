// End-to-end smoke test of the core flow. Usage:
//   node tests/smoke.mjs https://bowen1314.github.io/cleanest-hour/
// Requires `npm install` (playwright) and `npx playwright install chromium`.
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { prepareSeries, evaluate, hourLabel } from "../js/calc.js";

const BASE = process.argv[2] || "http://localhost:8961/";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

try {
  const res = await page.goto(BASE, { waitUntil: "networkidle" });
  check("page loads with HTTP 200", res.status() === 200, `status ${res.status()}`);
  await page.waitForFunction(() => /Start at/.test(document.querySelector("#hero-time").textContent));

  // 1) default: PJM dishwasher, compare to an independent computation from the same data file
  const pjm = JSON.parse(await (await fetch(new URL("data/PJM.json", BASE))).text());
  const exp = evaluate(prepareSeries(pjm), { kwh: 1.1, hours: 2, usual: 19, runsPerWeek: 4 });
  const hero = await page.textContent("#hero-time");
  check("default recommendation matches calc for PJM dishwasher", hero.includes(hourLabel(exp.best)), `${hero} vs ${hourLabel(exp.best)}`);
  const run = await page.textContent("#t-run");
  check("per-run kg shown", run.includes(exp.bestKg.toFixed(2)), `${run} (expected ${exp.bestKg.toFixed(2)})`);
  const yr = await page.textContent("#t-year");
  check("yearly saving shown", yr.includes(exp.yearlySaveKg.toFixed(1)), `${yr} (expected ${exp.yearlySaveKg.toFixed(1)})`);

  // 2) pick EV charging
  await page.click('#appliances [data-id="ev"]');
  await page.waitForFunction(() => document.querySelector("#hero-eyebrow").textContent.includes("EV charge"));
  check("EV preset sets 14 kWh / 2 h", (await page.inputValue("#kwh")) === "14" && (await page.inputValue("#hours")) === "2");

  // 3) switch to California
  await page.selectOption("#region", "CISO");
  await page.waitForFunction(() => document.querySelector("#hero-eyebrow").textContent.includes("California"));
  const ciso = JSON.parse(await (await fetch(new URL("data/CISO.json", BASE))).text());
  const expC = evaluate(prepareSeries(ciso), { kwh: 14, hours: 2, usual: 19, runsPerWeek: 5 });
  check("CISO EV recommendation matches calc", (await page.textContent("#hero-time")).includes(hourLabel(expC.best)), hourLabel(expC.best));

  // 4) availability window: overnight
  await page.selectOption("#window", "22-7");
  await page.waitForFunction(() => /between 10 pm and 7 am/.test(document.querySelector("#hero-sub").textContent));
  check("overnight window applied", true, (await page.textContent("#summary")).slice(0, 110));

  // 5) state finder -> New Jersey -> PJM
  await page.click(".finder summary");
  await page.selectOption("#state", "NJ");
  await page.click("#state-out button");
  await page.waitForFunction(() => document.querySelector("#region").value === "PJM");
  check("state finder NJ selects PJM", true);

  // 6) table view of the chart
  await page.click("#toggle-table");
  const rows = await page.$$eval("#hour-table tbody tr", (r) => r.length);
  check("hour table has 24 rows", rows === 24, `${rows}`);

  // 7) season filter changes the plan
  await page.check('input[name="season"][value="summer"]');
  await page.waitForFunction(() => document.querySelector("#hero-eyebrow").textContent.includes("summer"));
  check("season filter applied", true);

  // 8) calendar reminder download
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#ics")]);
  const ics = await readFile(await dl.path(), "utf8");
  check(".ics download is a weekly calendar event", /BEGIN:VCALENDAR/.test(ics) && /RRULE:FREQ=WEEKLY/.test(ics), dl.suggestedFilename());

  // 9) shareable link restores the plan
  const shared = page.url();
  const p2 = await ctx.newPage();
  await p2.goto(shared, { waitUntil: "networkidle" });
  await p2.waitForFunction(() => /Start at/.test(document.querySelector("#hero-time").textContent));
  check("shared link restores region + appliance + season", (await p2.inputValue("#region")) === "PJM" && (await p2.textContent("#hero-eyebrow")).includes("EV charge") && (await p2.textContent("#hero-eyebrow")).includes("summer"));
  await p2.close();

  // 10) all region files load and compute
  const index = JSON.parse(await (await fetch(new URL("data/index.json", BASE))).text());
  let okRegions = 0;
  for (const r of index.regions) {
    await page.selectOption("#region", r.ba);
    await page.waitForFunction((n) => document.querySelector("#hero-eyebrow").textContent.includes(n), r.name);
    okRegions++;
  }
  check("every region renders a recommendation", okRegions === index.regions.length, `${okRegions}/${index.regions.length}`);

  // 11) mobile width: no horizontal scroll
  const m = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  const mp = await m.newPage();
  await mp.goto(BASE, { waitUntil: "networkidle" });
  await mp.waitForFunction(() => /Start at/.test(document.querySelector("#hero-time").textContent));
  const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
  check("no horizontal scroll at 375px", sw <= 375, `scrollWidth ${sw}`);
  await m.close();

  // 12) offline after first visit (service worker; https or localhost only)
  const o = await browser.newContext();
  const op = await o.newPage();
  await op.goto(BASE, { waitUntil: "networkidle" });
  const swReady = await op.evaluate(async () => {
    if (!("serviceWorker" in navigator) || location.protocol !== "https:") return false;
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 250));
    // wait until all region files are cached
    for (let i = 0; i < 40; i++) {
      const keys = await caches.keys();
      if (keys.length) { const c = await caches.open(keys[0]); if ((await c.keys()).length >= 35) return true; }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  });
  if (swReady) {
    await o.setOffline(true);
    await op.reload({ waitUntil: "load" });
    await op.waitForFunction(() => /Start at/.test(document.querySelector("#hero-time").textContent), null, { timeout: 10000 });
    await op.selectOption("#region", "ERCO");
    await op.waitForFunction(() => document.querySelector("#hero-eyebrow").textContent.includes("ERCOT"), null, { timeout: 10000 });
    check("works offline after first visit (reload + switch region)", true);
  } else {
    check("works offline after first visit", BASE.startsWith("http://"), "skipped: service worker only registers over https");
  }
  await o.close();

  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  check("unexpected error", false, String(e).slice(0, 300));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
