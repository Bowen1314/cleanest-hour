import {
  prepareSeries, filterDays, evaluate, evaluateProfile, hourlyProfile, hourLabel, buildICS, SEASONS,
} from "./calc.js";

// ---------- static content ----------
const APPLIANCES = [
  {
    id: "dishwasher", label: "Dishwasher", noun: "dishwasher run", kwh: 1.1, hours: 2, runs: 4,
    source: "ENERGY STAR limit for a standard dishwasher is 240 kWh a year over 215 cycles, about 1.1 kWh per cycle including water heating.",
    url: "https://www.energystar.gov/products/dishwashers/key_product_criteria",
  },
  {
    id: "washer", label: "Clothes washer", noun: "laundry wash", kwh: 0.4, hours: 1, runs: 4,
    source: "Median of 301 ENERGY STAR certified U.S. standard-size washers: 120 kWh a year at the DOE test's 295 loads, including electric water heating, about 0.4 kWh per load (data.energystar.gov, queried 2026-10-24).",
    url: "https://data.energystar.gov/Active-Specifications/ENERGY-STAR-Certified-Residential-Clothes-Washers/bghd-e2wd",
  },
  {
    id: "dryer", label: "Electric dryer", noun: "dryer load", kwh: 2.2, hours: 1, runs: 3,
    source: "ENERGY STAR electric dryers dry at least 3.93 lb of laundry per kWh; the DOE test load is 8.45 lb, so about 2.2 kWh per load.",
    url: "https://www.energystar.gov/products/clothes_dryers/key_product_criteria",
  },
  {
    id: "ev", label: "EV charging", noun: "EV charge", kwh: 14, hours: 2, runs: 5,
    source: "About 40 miles of driving at roughly 35 kWh per 100 miles (U.S. DOE eGallon methodology) is 14 kWh. A 7.2 kW Level 2 charger delivers that in about 2 hours.",
    url: "https://www.energy.gov/sites/prod/files/2013/06/f1/eGallon-methodology-final.pdf",
  },
  {
    id: "waterheater", label: "Water heater boost", noun: "water heater boost", kwh: 4.5, hours: 1, runs: 7,
    source: "Assumed: one 4,500 W electric heating element running for an hour, a common residential element rating. Check your heater's nameplate.",
    url: null,
  },
  { id: "custom", label: "Custom", noun: "appliance run", kwh: null, hours: null, runs: null, source: "Enter your own energy per run (from the appliance's EnergyGuide label or a plug-in meter) and run length.", url: null },
];

// Approximate state -> balancing authority hints. Grid borders don't follow state lines.
const STATE_HINTS = {
  AL: ["SOCO", "TVA"], AK: [], AZ: ["AZPS", "SRP", "TEPC"], AR: ["MISO", "SWPP"], CA: ["CISO", "LDWP", "BANC"],
  CO: ["PSCO"], CT: ["ISNE"], DE: ["PJM"], DC: ["PJM"], FL: ["FPL", "FPC"], GA: ["SOCO"], HI: [],
  ID: ["IPCO", "PACE", "BPAT"], IL: ["PJM", "MISO"], IN: ["MISO", "PJM"], IA: ["MISO"], KS: ["SWPP"],
  KY: ["LGEE", "PJM", "TVA"], LA: ["MISO"], ME: ["ISNE"], MD: ["PJM"], MA: ["ISNE"], MI: ["MISO", "PJM"],
  MN: ["MISO"], MS: ["SOCO", "MISO", "TVA"], MO: ["MISO", "SWPP"], MT: ["NWMT"], NE: ["SWPP"], NV: ["NEVP"],
  NH: ["ISNE"], NJ: ["PJM"], NM: ["PNM", "SWPP"], NY: ["NYIS"], NC: ["DUK", "CPLE", "PJM"], ND: ["MISO", "SWPP"],
  OH: ["PJM"], OK: ["SWPP"], OR: ["PGE", "PACW", "BPAT"], PA: ["PJM"], RI: ["ISNE"], SC: ["DUK", "CPLE", "SCEG", "SC"],
  SD: ["SWPP", "MISO"], TN: ["TVA"], TX: ["ERCO", "SWPP", "MISO"], UT: ["PACE"], VT: ["ISNE"], VA: ["PJM"],
  WA: ["PSEI", "BPAT", "PACW"], WV: ["PJM"], WI: ["MISO"], WY: ["PACE"],
};
const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const ISOS = ["PJM", "MISO", "ERCO", "CISO", "SWPP", "NYIS", "ISNE"];
const MIX_GROUPS = [
  { key: "coal", label: "Coal", fuels: ["coal"], css: "--mix-1" },
  { key: "gasoil", label: "Gas & oil", fuels: ["gas", "oil"], css: "--mix-2" },
  { key: "otherf", label: "Other fuels", fuels: ["other"], css: "--mix-3" },
  { key: "nuchyd", label: "Nuclear, hydro, geothermal & storage", fuels: ["nuclear", "hydro", "geothermal", "storage"], css: "--mix-4" },
  { key: "ws", label: "Wind & solar", fuels: ["wind", "solar"], css: "--mix-5" },
];
const FUEL_LABEL = { coal: "Coal", gas: "Natural gas", oil: "Oil (petroleum)", nuclear: "Nuclear", hydro: "Hydro", wind: "Wind", solar: "Solar", geothermal: "Geothermal", storage: "Battery & pumped storage (discharge)", other: "Other & unknown fuels" };
const SEASON_LABEL = { all: "all year", winter: "winter (Dec–Feb)", spring: "spring (Mar–May)", summer: "summer (Jun–Aug)", fall: "fall (Sep–Nov)" };
const DAY_LABEL = { all: "every day", weekday: "weekdays", weekend: "weekends" };
const KG_PER_MILE_CAR = 0.4; // EPA: a typical passenger vehicle emits about 400 g CO2 per mile

// ---------- state ----------
const $ = (id) => document.getElementById(id);
const state = {
  region: "PJM", appliance: "dishwasher", kwh: 1.1, hours: 2, runs: 4, usual: 19,
  window: "any", winFrom: 22, winUntil: 7, season: "all", daytype: "all",
};
let INDEX = null;
const cache = new Map(); // ba -> {file, series}
let last = null; // last evaluation, for .ics/share

// ---------- helpers ----------
const fmtKg = (kg) => (Math.abs(kg) >= 100 ? kg.toFixed(0) : Math.abs(kg) >= 10 ? kg.toFixed(1) : kg.toFixed(2));
const fmtYr = (kg) => (Math.abs(kg) >= 100 ? kg.toFixed(0) : kg.toFixed(1));
const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
const pct = (x) => `${Math.round(x)}%`;
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
  }
  for (const k of kids) n.append(k);
  return n;
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const regionInfo = (ba) => INDEX.regions.find((r) => r.ba === ba);
const windowObj = () => {
  if (state.window === "any") return null;
  if (state.window === "custom") return { from: state.winFrom, until: state.winUntil };
  const [a, b] = state.window.split("-").map(Number);
  return { from: a, until: b };
};
const windowLabel = () => {
  const w = windowObj();
  return w ? `between ${hourLabel(w.from)} and ${hourLabel(w.until)}` : "any time of day";
};
const runHours = (start, hours) => {
  const out = [];
  for (let k = 0; k < Math.ceil(hours); k++) out.push((start + k) % 24);
  return out;
};

async function loadRegion(ba) {
  if (cache.has(ba)) return cache.get(ba);
  const res = await fetch(`data/${ba}.json`);
  if (!res.ok) throw new Error(`Could not load data for ${ba}`);
  const file = await res.json();
  const entry = { file, series: prepareSeries(file) };
  cache.set(ba, entry);
  return entry;
}

// ---------- URL hash (shareable plan) ----------
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const num = (k, lo, hi) => { const v = Number(p.get(k)); return p.has(k) && Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
  if (p.get("r") && INDEX.regions.some((r) => r.ba === p.get("r"))) state.region = p.get("r");
  if (p.get("a") && APPLIANCES.some((a) => a.id === p.get("a"))) {
    state.appliance = p.get("a");
    const a = APPLIANCES.find((x) => x.id === state.appliance);
    if (a.kwh) Object.assign(state, { kwh: a.kwh, hours: a.hours, runs: a.runs });
  }
  const k = num("e", 0.1, 100); if (k != null) state.kwh = k;
  const h = num("l", 0.5, 12); if (h != null) state.hours = Math.round(h * 2) / 2;
  const n = num("n", 1, 14); if (n != null) state.runs = Math.round(n);
  const u = num("u", 0, 23); if (u != null) state.usual = Math.round(u);
  const w = p.get("w");
  if (w && ["any", "22-7", "8-17", "17-23"].includes(w)) state.window = w;
  else if (w && /^\d{1,2}~\d{1,2}$/.test(w)) {
    const [a, b] = w.split("~").map(Number);
    if (a < 24 && b < 24) Object.assign(state, { window: "custom", winFrom: a, winUntil: b });
  }
  if (["all", ...SEASONS].includes(p.get("s"))) state.season = p.get("s");
  if (["all", "weekday", "weekend"].includes(p.get("d"))) state.daytype = p.get("d");
}
function writeHash() {
  const p = new URLSearchParams({
    r: state.region, a: state.appliance, e: state.kwh, l: state.hours, n: state.runs, u: state.usual,
    w: state.window === "custom" ? `${state.winFrom}~${state.winUntil}` : state.window, s: state.season, d: state.daytype,
  });
  history.replaceState(null, "", `#${p}`);
}

// ---------- controls ----------
function buildControls() {
  const sel = $("region");
  const g1 = el("optgroup", { label: "Large grid operators" });
  const g2 = el("optgroup", { label: "Utilities and other balancing authorities" });
  const sorted = [...INDEX.regions].sort((a, b) => a.name.localeCompare(b.name));
  for (const ba of ISOS) { const r = regionInfo(ba); if (r) g1.append(el("option", { value: r.ba, text: `${r.name} (${r.ba})` })); }
  for (const r of sorted) if (!ISOS.includes(r.ba)) g2.append(el("option", { value: r.ba, text: `${r.name} (${r.ba})` }));
  sel.append(g1, g2);

  const st = $("state");
  for (const [code, name] of Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]))) st.append(el("option", { value: code, text: name }));
  st.addEventListener("change", showStateHint);

  const chips = $("appliances");
  for (const a of APPLIANCES) {
    const b = el("button", { type: "button", class: "chip", role: "radio", "aria-checked": "false", "data-id": a.id, text: a.label });
    b.addEventListener("click", () => pickAppliance(a.id, true));
    b.addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      const i = APPLIANCES.findIndex((x) => x.id === a.id);
      const j = (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + APPLIANCES.length) % APPLIANCES.length;
      pickAppliance(APPLIANCES[j].id, true);
      chips.querySelector(`[data-id="${APPLIANCES[j].id}"]`).focus();
    });
    chips.append(b);
  }

  for (const id of ["usual", "win-from", "win-until"]) {
    const s = $(id);
    for (let h = 0; h < 24; h++) s.append(el("option", { value: h, text: hourLabel(h) }));
  }

  sel.addEventListener("change", () => { state.region = sel.value; update(); });
  $("kwh").addEventListener("input", () => { const v = Number($("kwh").value); if (v > 0 && v <= 100) { state.kwh = v; markCustomIfEdited(); update(); } });
  $("hours").addEventListener("input", () => { const v = Number($("hours").value); if (v >= 0.5 && v <= 12) { state.hours = Math.round(v * 2) / 2; markCustomIfEdited(); update(); } });
  $("runs").addEventListener("input", () => { const v = Number($("runs").value); if (v >= 1 && v <= 14) { state.runs = Math.round(v); update(); } });
  $("usual").addEventListener("change", () => { state.usual = Number($("usual").value); update(); });
  $("window").addEventListener("change", () => { state.window = $("window").value; update(); });
  $("win-from").addEventListener("change", () => { state.winFrom = Number($("win-from").value); update(); });
  $("win-until").addEventListener("change", () => { state.winUntil = Number($("win-until").value); update(); });
  for (const r of document.querySelectorAll('input[name="season"]')) r.addEventListener("change", () => { state.season = r.value; update(); });
  for (const r of document.querySelectorAll('input[name="daytype"]')) r.addEventListener("change", () => { state.daytype = r.value; update(); });

  $("ics").addEventListener("click", downloadICS);
  $("share").addEventListener("click", copyLink);
  toggleTable("toggle-table", "hour-table-wrap");
  toggleTable("toggle-mix-table", "mix-table-wrap");
}

function toggleTable(btnId, wrapId) {
  const b = $(btnId), w = $(wrapId);
  b.addEventListener("click", () => {
    const open = w.hidden;
    w.hidden = !open;
    b.setAttribute("aria-expanded", String(open));
    b.textContent = open ? "Hide table" : "Show as table";
  });
}

function markCustomIfEdited() {
  const a = APPLIANCES.find((x) => x.id === state.appliance);
  if (a.kwh != null && (a.kwh !== state.kwh || a.hours !== state.hours)) {
    state.appliance = "custom";
  }
}

function pickAppliance(id, apply) {
  state.appliance = id;
  const a = APPLIANCES.find((x) => x.id === id);
  if (apply && a.kwh != null) Object.assign(state, { kwh: a.kwh, hours: a.hours, runs: a.runs });
  update();
}

function showStateHint() {
  const out = $("state-out");
  out.replaceChildren();
  const code = $("state").value;
  if (!code) return;
  const list = (STATE_HINTS[code] || []).filter((ba) => regionInfo(ba));
  if (!list.length) {
    out.append(el("p", { text: `${STATE_NAMES[code]} is not covered: EIA-930 covers the contiguous U.S. grid only.` }));
    return;
  }
  out.append(el("p", { text: list.length > 1 ? `${STATE_NAMES[code]} is split between several grids. Your utility bill or utility's website names yours:` : `Most of ${STATE_NAMES[code]} is on:` }));
  for (const ba of list) {
    const r = regionInfo(ba);
    const b = el("button", { type: "button", class: "chip", text: `${r.name}` });
    b.addEventListener("click", () => { state.region = ba; update(); $("region").focus(); });
    out.append(b);
  }
}

function syncControls() {
  $("region").value = state.region;
  $("region-area").textContent = regionInfo(state.region).area + ".";
  for (const b of $("appliances").children) b.setAttribute("aria-checked", String(b.dataset.id === state.appliance));
  for (const b of $("appliances").children) b.tabIndex = b.dataset.id === state.appliance ? 0 : -1;
  const a = APPLIANCES.find((x) => x.id === state.appliance);
  const src = $("appliance-source");
  src.replaceChildren(a.source + " ");
  if (a.url) src.append(el("a", { href: a.url, text: "Source", rel: "noopener" }));
  if (document.activeElement !== $("kwh")) $("kwh").value = state.kwh;
  if (document.activeElement !== $("hours")) $("hours").value = state.hours;
  if (document.activeElement !== $("runs")) $("runs").value = state.runs;
  $("usual").value = state.usual;
  $("window").value = state.window;
  $("custom-window").hidden = state.window !== "custom";
  $("win-from").value = state.winFrom;
  $("win-until").value = state.winUntil;
  document.querySelector(`input[name="season"][value="${state.season}"]`).checked = true;
  document.querySelector(`input[name="daytype"][value="${state.daytype}"]`).checked = true;
}

// ---------- main update ----------
let pending = 0;
async function update() {
  const ticket = ++pending;
  syncControls();
  writeHash();
  let entry;
  try {
    entry = await loadRegion(state.region);
  } catch (e) {
    $("hero-eyebrow").textContent = "Could not load this region's data. If you are offline, choose a region you viewed before.";
    return;
  }
  if (ticket !== pending) return;
  const reg = regionInfo(state.region);
  const opts = { kwh: state.kwh, hours: state.hours, usual: state.usual, runsPerWeek: state.runs, season: state.season, dayType: state.daytype, window: windowObj() };
  let r;
  try {
    r = evaluate(entry.series, opts);
  } catch (e) {
    $("hero-eyebrow").textContent = "Adjust the inputs";
    $("hero-time").textContent = "–";
    $("hero-sub").textContent = e.message.includes("window") ? `A ${state.hours}-hour run doesn't fit ${windowLabel()}. Choose a wider window or a shorter run.` : e.message;
    return;
  }
  last = { r, reg, opts };
  renderHero(r, reg);
  const days = filterDays(entry.series, state.season, state.daytype);
  const prof = hourlyProfile(entry.series, days);
  renderChart(prof, r, reg);
  renderHourTable(prof, r);
  renderMix(entry.file, reg);
  renderPlan(entry.series, reg);
  renderCompare(entry.series);
  renderMethod(reg, entry);
}

function renderHero(r, reg) {
  const a = APPLIANCES.find((x) => x.id === state.appliance);
  const noun = a.noun;
  $("hero-eyebrow").textContent = `Cleanest start for a ${state.hours}-hour ${noun} · ${reg.name} · ${SEASON_LABEL[state.season]}, ${DAY_LABEL[state.daytype]}`;
  $("hero-time").textContent = `Start at ${hourLabel(r.best)}`;
  $("hero-sub").textContent = `Runs ${hourLabel(r.best)}–${hourLabel(r.best + state.hours)} ${reg.tzLabel}, ${windowLabel()}. Average grid intensity during the run: ${fmtInt(r.bestIntensity)} g CO₂e/kWh vs ${fmtInt(r.usualIntensity)} at your usual ${hourLabel(state.usual)} start.`;

  const kind = Math.abs(r.saveKg) <= 1e-9 ? "same" : r.saveKg < 0 ? "worse" : "better";
  $("t-run").textContent = `${fmtKg(r.bestKg)} kg`;
  $("t-run-note").textContent = kind === "same" ? `Same as your usual ${hourLabel(state.usual)} start`
    : kind === "better" ? `vs ${fmtKg(r.usualKg)} kg at ${hourLabel(state.usual)} (${pct(r.savePct)} less)`
    : `vs ${fmtKg(r.usualKg)} kg at ${hourLabel(state.usual)} (${pct(-r.savePct)} more)`;
  if (kind === "better") {
    $("t-year").textContent = `${fmtYr(r.yearlySaveKg)} kg less`;
    const miles = r.yearlySaveKg / KG_PER_MILE_CAR;
    $("t-year-note").textContent = `CO₂e a year at ${state.runs} run${state.runs > 1 ? "s" : ""}/week (${fmtYr(r.yearlyUsualKg)} → ${fmtYr(r.yearlyBestKg)} kg), about the CO₂ of driving ${fmtInt(miles)} miles in a typical gasoline car`;
  } else if (kind === "worse") {
    $("t-year").textContent = `${fmtYr(-r.yearlySaveKg)} kg more`;
    $("t-year-note").textContent = `Every start ${windowLabel()} is dirtier than ${hourLabel(state.usual)} on average. Try a wider window.`;
  } else {
    $("t-year").textContent = "0 kg";
    $("t-year-note").textContent = "Your usual time is already the cleanest choice";
  }
  if (kind === "same") {
    $("t-track").textContent = "–";
    $("t-track-note").textContent = "Nothing to compare";
  } else {
    $("t-track").textContent = `${pct(r.winShare * 100)} of days`;
    $("t-track-note").textContent = `Starting at ${hourLabel(r.best)} was cleaner than ${hourLabel(state.usual)} on ${fmtInt(r.winShare * r.days)} of ${r.days} actual days`;
  }

  const oracleSave = r.usualKg - r.oracleKg;
  let s;
  if (kind === "same") s = `Your usual ${hourLabel(state.usual)} start is already the cleanest typical time ${windowLabel()} on this grid.`;
  else if (kind === "worse") s = `On this grid no start ${windowLabel()} beats ${hourLabel(state.usual)} on average; ${hourLabel(r.best)} is the least-bad option inside your window. With no time limit, the cleanest start here is ${hourLabel(bestAnyTime(r))}.`;
  else s = `Moving this ${noun} from ${hourLabel(state.usual)} to ${hourLabel(r.best)} cuts its emissions by ${pct(r.savePct)}: ${fmtKg(r.saveKg)} kg CO₂e per run, ${fmtYr(r.yearlySaveKg)} kg a year.`;
  if (kind !== "worse" && oracleSave > Math.max(0, r.saveKg) + 1e-6) {
    s += ` Picking the best hour each day with perfect hindsight would have saved ${fmtYr(oracleSave * r.runsPerYear)} kg a year, which shows what a live forecast could add.`;
  }
  $("summary").textContent = s;
}

function bestAnyTime(r) {
  let b = 0;
  for (let h = 0; h < 24; h++) if (r.perStartAll[h] < r.perStartAll[b]) b = h;
  return b;
}

// ---------- charts ----------
const tooltip = () => $("tooltip");
function showTip(evt, rows) {
  const t = tooltip();
  t.replaceChildren(...rows);
  t.hidden = false;
  const x = evt.clientX ?? (evt.target.getBoundingClientRect().left + 10);
  const y = evt.clientY ?? evt.target.getBoundingClientRect().top;
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x + 12))}px`;
  t.style.top = `${Math.max(8, y - h - 12)}px`;
}
const hideTip = () => { tooltip().hidden = true; };

function niceMax(v) {
  const steps = [50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200];
  return steps.find((s) => s >= v) || Math.ceil(v / 200) * 200;
}

function renderChart(prof, r, reg) {
  const host = $("chart");
  const W = 720, H = 280, L = 44, R = 8, T = 22, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const max = niceMax(Math.max(...prof.p90) * 1.05);
  const y = (v) => T + ph - (v / max) * ph;
  const band = pw / 24;
  const bw = Math.min(24, band - 4);
  const best = new Set(runHours(r.best, state.hours));
  const usual = new Set(runHours(state.usual, state.hours));
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Bar chart of average carbon intensity for each hour of the day on ${reg.name}, ${SEASON_LABEL[state.season]}. Lowest ${fmtInt(Math.min(...prof.mean))} g/kWh at ${hourLabel(prof.mean.indexOf(Math.min(...prof.mean)))}, highest ${fmtInt(Math.max(...prof.mean))} g/kWh at ${hourLabel(prof.mean.indexOf(Math.max(...prof.mean)))}. Recommended run highlighted from ${hourLabel(r.best)}. A table version is available.` });
  const grid = svgEl("g", { class: "grid" });
  const axis = svgEl("g", { class: "axis" });
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    grid.append(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    const t = svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" });
    t.textContent = String(Math.round(v));
    axis.append(t);
  }
  const unit = svgEl("text", { x: L - 6, y: T - 10, "text-anchor": "end" });
  unit.textContent = "g/kWh";
  axis.append(unit);
  for (let h = 0; h < 24; h += 3) {
    const t = svgEl("text", { x: L + band * h + band / 2, y: H - 10, "text-anchor": "middle" });
    t.textContent = hourLabel(h);
    axis.append(t);
  }
  svg.append(grid, axis);
  for (let h = 0; h < 24; h++) {
    const g = svgEl("g", { class: "col" });
    const x = L + band * h + (band - bw) / 2;
    const v = prof.mean[h];
    const color = best.has(h) ? "var(--best)" : usual.has(h) ? "var(--usual)" : "var(--other)";
    const top = y(v), base = y(0);
    const rr = Math.min(4, (base - top) / 2);
    const d = `M${x},${base} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${base} Z`;
    const hit = svgEl("rect", { class: "hit", x: L + band * h, y: T, width: band, height: ph });
    g.append(hit, svgEl("path", { class: "bar", d, fill: color }));
    // whisker: middle 80% of days
    const cx = x + bw / 2;
    g.append(svgEl("line", { class: "whisker", x1: cx, x2: cx, y1: y(prof.p10[h]), y2: y(prof.p90[h]) }));
    const tipRows = () => {
      const tag = best.has(h) ? "Recommended run" : usual.has(h) ? "Your usual run" : "";
      return [
        el("div", {}, el("strong", { text: `${fmtInt(v)} g CO₂e/kWh` })),
        el("div", { text: `${hourLabel(h)}–${hourLabel(h + 1)} average${tag ? " · " + tag : ""}` }),
        el("div", { text: `Middle 80% of days: ${fmtInt(prof.p10[h])}–${fmtInt(prof.p90[h])}` }),
      ];
    };
    hit.addEventListener("pointermove", (e) => showTip(e, tipRows()));
    hit.addEventListener("pointerleave", hideTip);
    svg.append(g);
  }
  // direct label on the recommended run
  const bx = L + band * r.best + band / 2;
  const lbl = svgEl("text", { class: "annot", x: Math.min(W - R - 40, Math.max(L + 40, bx)), y: Math.max(12, y(Math.max(...[...best].map((h) => prof.p90[h]))) - 6), "text-anchor": "middle" });
  lbl.textContent = `Start ${hourLabel(r.best)}`;
  svg.append(lbl);
  host.replaceChildren(svg);
  $("chart-sub").textContent = `${reg.name}, ${SEASON_LABEL[state.season]}, ${DAY_LABEL[state.daytype]} (${r.days} days). Bars are the average for each clock hour (${reg.tzLabel}); lines show the range on the middle 80% of days.`;
}

function renderHourTable(prof, r) {
  const t = $("hour-table");
  const head = el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "Hour" }), el("th", { scope: "col", text: "Average g/kWh" }), el("th", { scope: "col", text: "10th percentile" }), el("th", { scope: "col", text: "90th percentile" }), el("th", { scope: "col", text: `kg per run if started here` })));
  const body = el("tbody");
  for (let h = 0; h < 24; h++) {
    const tr = el("tr", {}, el("td", { text: `${hourLabel(h)}–${hourLabel(h + 1)}` }), el("td", { text: fmtInt(prof.mean[h]) }), el("td", { text: fmtInt(prof.p10[h]) }), el("td", { text: fmtInt(prof.p90[h]) }), el("td", { text: Number.isNaN(r.perStart[h]) ? `${fmtKg(r.perStartAll[h])} (outside window)` : fmtKg(r.perStart[h]) }));
    if (h === r.best) tr.className = "current";
    body.append(tr);
  }
  t.replaceChildren(el("caption", { class: "sr-only", text: "Average carbon intensity by hour" }), head, body);
}

function mixFor(file) {
  const key = state.season === "all" ? "all" : state.season;
  const rows = file.mix[key];
  return rows.map((row) => MIX_GROUPS.map((g) => g.fuels.reduce((s, f) => s + row[file.fuels.indexOf(f)], 0) / 10));
}

function renderMix(file, reg) {
  const shares = mixFor(file);
  const host = $("mix-chart");
  const W = 720, H = 240, L = 44, R = 8, T = 10, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const band = pw / 24, bw = Math.min(24, band - 4);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Stacked bar chart of the average generation mix by hour on ${reg.name}, ${SEASON_LABEL[state.season]}. A table version is available.` });
  const grid = svgEl("g", { class: "grid" }), axis = svgEl("g", { class: "axis" });
  for (const v of [0, 25, 50, 75, 100]) {
    const yy = T + ph - (v / 100) * ph;
    grid.append(svgEl("line", { x1: L, x2: W - R, y1: yy, y2: yy }));
    const t = svgEl("text", { x: L - 6, y: yy + 4, "text-anchor": "end" });
    t.textContent = `${v}%`;
    axis.append(t);
  }
  for (let h = 0; h < 24; h += 3) {
    const t = svgEl("text", { x: L + band * h + band / 2, y: H - 10, "text-anchor": "middle" });
    t.textContent = hourLabel(h);
    axis.append(t);
  }
  svg.append(grid, axis);
  for (let h = 0; h < 24; h++) {
    const g = svgEl("g", { class: "col" });
    const x = L + band * h + (band - bw) / 2;
    const hit = svgEl("rect", { class: "hit", x: L + band * h, y: T, width: band, height: ph });
    g.append(hit);
    let acc = 0;
    const tot = shares[h].reduce((a, b) => a + b, 0) || 100;
    shares[h].forEach((v, i) => {
      const hgt = (v / tot) * ph;
      const y0 = T + ph - acc - hgt;
      if (hgt > 0.5) g.append(svgEl("rect", { class: "bar", x, y: y0 + (acc > 0 ? 0 : 0), width: bw, height: Math.max(0, hgt - 2), fill: `var(${MIX_GROUPS[i].css})`, rx: 1 }));
      acc += hgt;
    });
    hit.addEventListener("pointermove", (e) => showTip(e, [
      el("div", { text: `${hourLabel(h)}–${hourLabel(h + 1)}` }),
      ...MIX_GROUPS.map((m, i) => el("div", { class: "tt-row" }, el("span", { class: "tt-key", style: `background:var(${m.css})` }), el("strong", { text: `${Math.round((shares[h][i] / tot) * 100)}%` }), document.createTextNode(` ${m.label}`))).reverse(),
    ]));
    hit.addEventListener("pointerleave", hideTip);
    svg.append(g);
  }
  host.replaceChildren(svg);
  const leg = $("mix-legend");
  leg.replaceChildren(...[...MIX_GROUPS].reverse().map((m) => el("span", {}, el("i", { class: "key", style: `background:var(${m.css})` }), document.createTextNode(m.label))));
  $("mix-sub").textContent = `Average share of generation by source for each clock hour, ${SEASON_LABEL[state.season]}. Hours with more coal and gas are dirtier; wind and solar pull intensity down.`;
  const t = $("mix-table");
  const head = el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "Hour" }), ...MIX_GROUPS.map((m) => el("th", { scope: "col", text: m.label }))));
  const body = el("tbody");
  shares.forEach((row, h) => {
    const tot = row.reduce((a, b) => a + b, 0) || 100;
    body.append(el("tr", {}, el("td", { text: hourLabel(h) }), ...row.map((v) => el("td", { text: `${Math.round((v / tot) * 100)}%` }))));
  });
  t.replaceChildren(el("caption", { class: "sr-only", text: "Generation mix by hour" }), head, body);
}

function renderPlan(series, reg) {
  const t = $("plan-table");
  const head = el("thead", {}, el("tr", {}, ...["Season", "Cleanest start", "kg per run", `kg at ${hourLabel(state.usual)}`, "Saving", "Cleaner on"].map((h) => el("th", { scope: "col", text: h }))));
  const body = el("tbody");
  for (const s of ["all", ...SEASONS]) {
    try {
      const r = evaluate(series, { kwh: state.kwh, hours: state.hours, usual: state.usual, runsPerWeek: state.runs, season: s, dayType: state.daytype, window: windowObj() });
      const tr = el("tr", {},
        el("td", { text: SEASON_LABEL[s][0].toUpperCase() + SEASON_LABEL[s].slice(1) }),
        el("td", { text: hourLabel(r.best) }),
        el("td", { text: fmtKg(r.bestKg) }),
        el("td", { text: fmtKg(r.usualKg) }),
        el("td", { text: `${pct(r.savePct)}` }),
        el("td", { text: `${pct(r.winShare * 100)} of days` }));
      if (s === state.season) tr.className = "current";
      body.append(tr);
    } catch { /* window doesn't fit: shown in hero */ }
  }
  t.replaceChildren(el("caption", { class: "sr-only", text: "Cleanest start by season" }), head, body);
}

function renderCompare(series) {
  const o = { kwh: state.kwh, hours: state.hours, usual: state.usual, runsPerWeek: state.runs, window: windowObj() };
  // other grids: 12-month average day; the selected grid: the full day-by-day calculation (all year, every day)
  const rows = INDEX.regions.map((reg) => ({ reg, r: reg.ba === state.region ? evaluate(series, o) : evaluateProfile(reg.profileAll, o) }));
  rows.sort((a, b) => b.r.yearlySaveKg - a.r.yearlySaveKg);
  const t = $("compare-table");
  const head = el("thead", {}, el("tr", {}, ...["Grid", "Cleanest start", `kg per run: ${hourLabel(state.usual)} → best`, "Saving", "kg/year"].map((h) => el("th", { scope: "col", text: h }))));
  const body = el("tbody");
  for (const { reg, r } of rows) {
    const tr = el("tr", {}, el("td", { text: `${reg.name} (${reg.ba})` }), el("td", { text: `${hourLabel(r.best)} ${reg.tzLabel.split(" ")[0].replace("Eastern", "ET").replace("Central", "CT").replace("Mountain", "MT").replace("Pacific", "PT").replace("Arizona", "AZ")}` }), el("td", { text: `${fmtKg(r.usualKg)} → ${fmtKg(r.bestKg)}` }), el("td", { text: pct(r.savePct) }), el("td", { text: fmtYr(r.yearlySaveKg) }));
    if (reg.ba === state.region) tr.className = "current";
    body.append(tr);
  }
  t.replaceChildren(el("caption", { class: "sr-only", text: "Savings by grid region" }), head, body);
  $("compare-sub").textContent = `Same appliance (${state.kwh} kWh over ${state.hours} h, ${state.runs}×/week), usual start ${hourLabel(state.usual)} local time, ${windowLabel()}, all year. Other grids use their 12-month average day; your grid uses the day-by-day calculation. Grids with lots of solar reward shifting the most; grids that are clean or flat all day reward it least.`;
}

function renderMethod(reg, entry) {
  for (const n of document.querySelectorAll(".m-range")) n.textContent = `${INDEX.dateRange.start} to ${INDEX.dateRange.end}, ${INDEX.dateRange.days} days`;
  for (const n of document.querySelectorAll(".m-region")) n.textContent = `${reg.name} (${reg.ba})`;
  for (const n of document.querySelectorAll(".m-tz")) n.textContent = reg.tzLabel;
  const f = entry.file.factors_g_per_kwh;
  const t = $("factor-table");
  const head = el("thead", {}, el("tr", {}, ...["Source", "Share of generation", "g CO₂e/kWh", "lb CO₂e/MWh (eGRID)"].map((h) => el("th", { scope: "col", text: h }))));
  const body = el("tbody");
  for (const fuel of entry.file.fuels) {
    body.append(el("tr", {}, el("td", { text: FUEL_LABEL[fuel] }), el("td", { text: `${(reg.genShare[fuel] * 100).toFixed(1)}%` }), el("td", { text: fmtInt(f[fuel]) }), el("td", { text: fmtInt(reg.factors_lb_per_mwh[fuel]) })));
  }
  body.append(el("tr", { class: "current" }, el("td", { text: "12-month average (this tool)" }), el("td", { text: "100%" }), el("td", { text: fmtInt(reg.annualAvg_g_per_kwh) }), el("td", { text: "" })));
  body.append(el("tr", {}, el("td", { text: "eGRID2023 annual average, for comparison" }), el("td", { text: "" }), el("td", { text: fmtInt(reg.egrid2023Avg_g_per_kwh) }), el("td", { text: fmtInt(reg.egrid2023Avg_g_per_kwh / 0.45359237) })));
  t.replaceChildren(el("caption", { class: "sr-only", text: "Emission factors" }), head, body);
  const notes = [...reg.factorNotes];
  if (entry.series.filled) notes.push(`${entry.series.filled} missing hours (of ${INDEX.dateRange.days * 24}) were filled with that clock hour's average`);
  $("factor-notes").textContent = notes.length ? `Notes: ${notes.join("; ")}.` : "";

  const ul = $("assumptions");
  ul.replaceChildren(...APPLIANCES.filter((a) => a.kwh).map((a) => {
    const li = el("li", {}, el("strong", { text: `${a.label}: ${a.kwh} kWh over ${a.hours} h. ` }), document.createTextNode(a.source + " "));
    if (a.url) li.append(el("a", { href: a.url, text: "Source", rel: "noopener" }));
    return li;
  }), el("li", {}, el("strong", { text: "Driving comparison: " }), document.createTextNode("about 400 g of CO₂ per mile for a typical passenger vehicle (U.S. EPA). "), el("a", { href: "https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle", text: "Source", rel: "noopener" })));

  const prov = $("provenance");
  prov.replaceChildren(
    ...INDEX.sources.eia930.map((s) => el("li", {}, document.createTextNode("EIA-930 "), el("code", { text: s.file }), document.createTextNode(`, downloaded 2026-10-24 (server Last-Modified ${s.lastModified}), from `), el("a", { href: `https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/${s.file}`, text: "eia.gov", rel: "noopener" }))),
    el("li", {}, document.createTextNode("EPA eGRID2023 revision 2 "), el("code", { text: INDEX.sources.egrid.file }), document.createTextNode(" (released June 2025), from "), el("a", { href: INDEX.sources.egrid.url, text: "epa.gov", rel: "noopener" })),
    el("li", {}, document.createTextNode(`Processed by scripts/build_data.py on ${INDEX.generated}. `), el("a", { href: "https://github.com/Bowen1314/cleanest-hour/blob/main/scripts/build_data.py", text: "View the script", rel: "noopener" })),
  );
}

// ---------- actions ----------
function downloadICS() {
  if (!last) return;
  const { r, reg } = last;
  const a = APPLIANCES.find((x) => x.id === state.appliance);
  const name = a.id === "custom" ? "appliance" : a.label.toLowerCase().replace("ev ", "EV ");
  const ics = buildICS({
    title: `${a.id === "ev" ? "Plug in the EV" : "Start the " + name} (cleanest hour)`,
    description: `Cleanest Hour plan for ${reg.name}: start at ${hourLabel(r.best)} ${reg.tzLabel} instead of ${hourLabel(state.usual)}. Typical saving ${fmtKg(r.saveKg)} kg CO2e per run (${pct(r.savePct)}), ${fmtKg(r.yearlySaveKg)} kg a year at ${state.runs} runs/week. Times use your device clock. Plan: ${location.href}`,
    startHour: r.best, hours: state.hours, runsPerWeek: Math.min(7, state.runs),
  });
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: `cleanest-hour-${name.replace(/\s+/g, "-")}.ics` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("share-status").textContent = "Reminder file downloaded. Open it to add it to your calendar.";
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    $("share-status").textContent = "Link copied. It opens this exact plan.";
  } catch {
    $("share-status").textContent = `Copy this link: ${location.href}`;
  }
}

// ---------- boot ----------
async function boot() {
  try {
    INDEX = await (await fetch("data/index.json")).json();
  } catch {
    $("hero-eyebrow").textContent = "Could not load grid data. Check your connection and reload.";
    return;
  }
  readHash();
  buildControls();
  update();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
