// Records demo/demo.webm (converted to demo.mp4 with ffmpeg) and screenshots/*.png.
// Captions are overlaid in the page; every number in a caption is read from the rendered app.
// Usage: node demo/record.mjs <url> [--shots-only]
import { chromium } from "playwright";
import { mkdir, rename, readdir, writeFile } from "node:fs/promises";

const BASE = process.argv[2] || "https://bowen1314.github.io/cleanest-hour/";
const SHOTS_ONLY = process.argv.includes("--shots-only");
const OUT = new URL("./", import.meta.url).pathname;
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
await mkdir(SHOTS, { recursive: true });
await mkdir(OUT + "raw", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: "light",
  ...(SHOTS_ONLY ? {} : { recordVideo: { dir: OUT + "raw", size: { width: 1280, height: 800 } } }),
});
const page = await ctx.newPage();
const transcript = [];
const t0 = Date.now();
const wait = (ms) => page.waitForTimeout(SHOTS_ONLY ? 150 : ms);
const text = (sel) => page.textContent(sel).then((s) => s.trim());

async function caption(msg, ms = 6000) {
  const at = ((Date.now() - t0) / 1000).toFixed(0);
  transcript.push({ at, msg });
  await page.evaluate((m) => {
    let c = document.getElementById("demo-caption");
    if (!c) {
      c = document.createElement("div");
      c.id = "demo-caption";
      c.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:1040px;width:calc(100% - 80px);background:rgba(10,20,15,.9);color:#fff;font:600 21px/1.4 system-ui,sans-serif;padding:14px 20px;border-radius:12px;z-index:9999;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.3);pointer-events:none";
      document.body.append(c);
    }
    c.textContent = m;
    c.style.display = m ? "block" : "none";
  }, msg);
  await wait(ms);
}
const hideCaption = () => page.evaluate(() => { const c = document.getElementById("demo-caption"); if (c) c.style.display = "none"; });
async function scrollTo(sel, block = "start") {
  await page.evaluate(([s, b]) => document.querySelector(s).scrollIntoView({ behavior: "smooth", block: b }), [sel, block]);
  await wait(1200);
}
async function shot(name) {
  await hideCaption();
  await page.screenshot({ path: SHOTS + name });
}
const ready = (fragment) => page.waitForFunction((f) => document.querySelector("#hero-eyebrow").textContent.includes(f), fragment);

await page.goto(BASE + "#r=MISO&a=dishwasher", { waitUntil: "networkidle" });
await page.waitForFunction(() => /Start at/.test(document.querySelector("#hero-time").textContent));
await caption("Cleanest Hour: when should I run it? It finds the hour your grid burns the least fossil fuel for appliances you can shift.", 7000);
await caption("It uses 12 months of real hourly grid data (EIA-930, Oct 2025 – Sep 2026) and EPA eGRID emission factors. No account needed, and it works offline.", 7000);

// pick grid by state
await page.click(".finder summary");
await wait(600);
await page.selectOption("#state", "NJ");
await caption("Step 1: pick your grid. Not sure which one you're on? Search by state. New Jersey is on PJM.", 5000);
await page.click("#state-out button");
await ready("PJM");
await wait(800);

// EV
await page.click('#appliances [data-id="ev"]');
await ready("EV charge");
await caption("Step 2: pick an appliance. EV charging: about 40 miles' worth, 14 kWh over 2 hours (DOE figures; you can edit them).", 6500);
const hero = await text("#hero-time");
const run = await text("#t-run"), runNote = await text("#t-run-note");
const yr = await text("#t-year"), track = await text("#t-track"), trackNote = await text("#t-track-note");
await caption(`Result: ${hero}. ${run} CO2e per charge, ${runNote.replace(/^vs /, "versus ")}.`, 7000);
await caption(`At 5 charges a week that's ${yr} CO2e a year. ${trackNote}, so the habit holds up on real days, not just on average.`, 8000);
await shot("1-hero-pjm-ev.png");

// chart
await scrollTo("#chart-title");
await caption("Why noon? This is PJM's average carbon intensity for each hour of the day. Your usual 7 pm run is orange, the recommended run is blue.", 7500);
await scrollTo("#mix-title");
await caption("The generation mix behind it: at noon solar supplies about 9% of PJM's power vs 1% at 7 pm, and gas drops from 43% to 39%.", 6000);

// overnight window
await scrollTo("#controls");
await page.selectOption("#window", "22-7");
await ready("EV charge");
await wait(500);
await page.evaluate(() => document.querySelector("#result").scrollIntoView({ behavior: "smooth", block: "start" }));
await wait(1000);
await caption(`Car only home at night? Restrict the window to 10 pm – 7 am: ${await text("#hero-time")}, ${await text("#t-year")} a year.`, 7000);

// California
await page.selectOption("#region", "CISO");
await ready("California");
await wait(600);
await caption(`Now California. "Charge overnight" is common advice, but here the best overnight start emits ${await text("#t-run")}, ${(await text("#t-run-note")).replace(/^vs/, "versus")}. On a solar-heavy grid, night isn't cleaner.`, 8500);
await page.selectOption("#window", "any");
await ready("California");
await wait(600);
await caption(`Allow any time and the answer flips: ${await text("#hero-time")}, ${await text("#t-run")} per charge ${(await text("#t-run-note")).replace(/^vs/, "versus")}: ${await text("#t-year")} a year.`, 7500);
await scrollTo("#chart-title");
await caption("The solar dip is obvious on California's grid. The lines show the spread across the middle 80% of days.", 6000);
await shot("2-chart-california.png");

// compare table
await scrollTo("#compare-title");
const nGrids = await page.$$eval("#compare-table tbody tr", (r) => r.length);
await caption(`How much does timing matter elsewhere? Same EV and 7 pm habit on ${nGrids} U.S. grids. Solar-heavy grids reward shifting the most.`, 7500);
await shot("3-compare-grids.png");

// seasonal plan + reminders
await page.selectOption("#region", "PJM");
await ready("PJM");
await scrollTo("#plan-title");
await caption("Back to New Jersey. The best hour shifts with the seasons, so here's the plan for each one.", 6500);
await scrollTo("#result");
await caption("Turn it into a habit: download a weekly calendar reminder (.ics), or copy a link that reopens this exact plan.", 5500);
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#ics")]);
await dl.path();
await wait(1500);
await shot("4-plan-actions.png");

// method
await scrollTo("#method");
await caption("How this is calculated: generation by source × eGRID factor for each hour, then averaged over the hours your run covers. The factors for PJM are listed.", 8000);
await shot("5-method.png");
await page.evaluate(() => document.querySelector(".limits").scrollIntoView({ behavior: "smooth", block: "center" }));
await wait(1200);
await caption("Limitations, stated plainly: these are average emissions, not marginal ones; it's history, not a forecast; imports aren't traced; and battery discharge counts as zero.", 9000);
await scrollTo("body");
await caption("Cleanest Hour is open source (MIT) and uses public-domain U.S. government data: github.com/Bowen1314/cleanest-hour", 7000);
await hideCaption();
await wait(800);

const video = page.video();
await ctx.close();
await browser.close();
if (video && !SHOTS_ONLY) {
  const p = await video.path();
  await rename(p, OUT + "demo.webm");
}
await writeFile(OUT + "captions.json", JSON.stringify(transcript, null, 1));
console.log("done", ((Date.now() - t0) / 1000).toFixed(0) + "s", transcript.length, "captions");
