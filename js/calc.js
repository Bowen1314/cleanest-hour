// Cleanest Hour - pure calculation functions (no DOM). Used by the app and by tests/calc.test.mjs.

export const SEASONS = ["winter", "spring", "summer", "fall"];
const SEASON_OF_MONTH = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "fall", "fall", "fall", "winter"];
export const DAYS_PER_WEEK_TO_YEAR = 365.25 / 7; // runs/week -> runs/year

/**
 * Turn a region file into a flat hourly array plus per-day metadata.
 * Missing hours (EIA gaps, the skipped DST hour) are filled with the mean of the same
 * clock hour across all days, and counted in `filled`.
 */
export function prepareSeries(file) {
  const days = file.ci.length;
  const flat = new Float64Array(days * 24);
  const hourMean = new Array(24).fill(0);
  const hourN = new Array(24).fill(0);
  for (const day of file.ci) for (let h = 0; h < 24; h++) if (day[h] != null) { hourMean[h] += day[h]; hourN[h]++; }
  for (let h = 0; h < 24; h++) hourMean[h] = hourN[h] ? hourMean[h] / hourN[h] : 0;
  let filled = 0;
  file.ci.forEach((day, d) => {
    for (let h = 0; h < 24; h++) {
      const v = day[h];
      if (v == null) { flat[d * 24 + h] = hourMean[h]; filled++; } else flat[d * 24 + h] = v;
    }
  });
  const [y, m, dd] = file.start.split("-").map(Number);
  const meta = [];
  for (let d = 0; d < days; d++) {
    const dt = new Date(Date.UTC(y, m - 1, dd + d));
    const dow = dt.getUTCDay();
    meta.push({
      iso: dt.toISOString().slice(0, 10),
      season: SEASON_OF_MONTH[dt.getUTCMonth()],
      weekend: dow === 0 || dow === 6,
    });
  }
  return { flat, days, meta, filled, start: file.start };
}

/** Day indexes matching a season ("all" or a SEASONS name) and day type ("all"|"weekday"|"weekend"). */
export function filterDays(series, season = "all", dayType = "all") {
  const out = [];
  series.meta.forEach((m, d) => {
    if (season !== "all" && m.season !== season) return;
    if (dayType === "weekday" && m.weekend) return;
    if (dayType === "weekend" && !m.weekend) return;
    out.push(d);
  });
  return out;
}

/**
 * Average grams CO2e per kWh over a run that starts at clock hour `start` on day `d` and lasts
 * `hours` (may be fractional; may cross midnight into the next day). Energy is assumed to be drawn
 * evenly over the run. Returns NaN if the run would extend past the end of the data.
 */
export function runIntensity(flat, d, start, hours) {
  const base = d * 24 + start;
  const whole = Math.floor(hours);
  const frac = hours - whole;
  const last = base + whole + (frac > 0 ? 1 : 0) - 1;
  if (last >= flat.length) return NaN;
  let sum = 0;
  for (let k = 0; k < whole; k++) sum += flat[base + k];
  if (frac > 0) sum += frac * flat[base + whole];
  return sum / hours;
}

/** kg CO2e for one run of `kwh` energy. */
export const runKg = (flat, d, start, hours, kwh) => (runIntensity(flat, d, start, hours) * kwh) / 1000;

/**
 * Start hours (0-23) allowed by an availability window. `win` is null (any time) or
 * {from, until}: the run must start at/after `from` and finish by `until` (clock hours, may wrap
 * past midnight; from === until means a full 24 h window).
 */
export function allowedStarts(hours, win) {
  const all = [...Array(24).keys()];
  if (!win) return all;
  let len = (win.until - win.from + 24) % 24;
  if (len === 0) len = 24;
  // returned in window order (earliest allowed start first)
  return all.map((k) => (win.from + k) % 24).filter((s) => {
    const off = (s - win.from + 24) % 24;
    return off + hours <= len + 1e-9;
  });
}

/**
 * Core evaluation. opts = {kwh, hours, usual, runsPerWeek, season, dayType, window}
 * Returns per-start mean kg, the recommended (lowest mean) start, the usual start's kg,
 * savings, a day-by-day backtest and a perfect-hindsight bound.
 */
export function evaluate(series, opts) {
  const { kwh, hours, usual, runsPerWeek = 7, season = "all", dayType = "all", window = null } = opts;
  if (!(kwh > 0) || !(hours > 0) || hours > 24) throw new Error("kwh and hours must be positive (hours <= 24)");
  const days = filterDays(series, season, dayType).filter((d) => {
    // keep only days where every start hour's run fits inside the data
    return d * 24 + 23 + Math.ceil(hours) <= series.flat.length;
  });
  if (!days.length) throw new Error("no days match the filter");
  const starts = allowedStarts(hours, window);
  if (!starts.length) throw new Error("run does not fit in the availability window");
  const perStart = new Array(24).fill(NaN);
  const perStartAll = new Array(24).fill(0);
  for (let s = 0; s < 24; s++) {
    let sum = 0;
    for (const d of days) sum += runKg(series.flat, d, s, hours, kwh);
    perStartAll[s] = sum / days.length;
  }
  for (const s of starts) perStart[s] = perStartAll[s];
  let best = starts[0];
  for (const s of starts) if (perStart[s] < perStart[best] - 1e-12) best = s;
  let worst = 0;
  for (let s = 0; s < 24; s++) if (perStartAll[s] > perStartAll[worst]) worst = s;

  // backtest on actual days: fixed recommended start vs usual start, and the hindsight bound
  let wins = 0, ties = 0, oracleSum = 0;
  for (const d of days) {
    const kb = runKg(series.flat, d, best, hours, kwh);
    const ku = runKg(series.flat, d, usual, hours, kwh);
    if (kb < ku - 1e-9) wins++; else if (Math.abs(kb - ku) <= 1e-9) ties++;
    let mn = Infinity;
    for (const s of starts) mn = Math.min(mn, runKg(series.flat, d, s, hours, kwh));
    oracleSum += mn;
  }
  const bestKg = perStart[best];
  const usualKg = perStartAll[usual];
  const saveKg = usualKg - bestKg;
  const runsPerYear = runsPerWeek * DAYS_PER_WEEK_TO_YEAR;
  return {
    days: days.length, starts, perStart, perStartAll, best, worst,
    bestKg, usualKg, saveKg,
    savePct: usualKg > 0 ? (100 * saveKg) / usualKg : 0,
    runsPerYear,
    yearlyUsualKg: usualKg * runsPerYear,
    yearlyBestKg: bestKg * runsPerYear,
    yearlySaveKg: saveKg * runsPerYear,
    winShare: wins / days.length, tieShare: ties / days.length,
    oracleKg: oracleSum / days.length,
    bestIntensity: (bestKg * 1000) / kwh,
    usualIntensity: (usualKg * 1000) / kwh,
  };
}

/** Hourly mean and 10th/90th percentile intensity over the selected days. */
export function hourlyProfile(series, days) {
  const mean = [], p10 = [], p90 = [];
  for (let h = 0; h < 24; h++) {
    const vals = days.map((d) => series.flat[d * 24 + h]).sort((a, b) => a - b);
    mean.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    p10.push(quantile(vals, 0.1));
    p90.push(quantile(vals, 0.9));
  }
  return { mean, p10, p90 };
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Same recommendation computed from a 24-value average profile (used for the cross-region
 * comparison, where only index.json profiles are loaded). Wraps past midnight onto the same profile.
 */
export function evaluateProfile(profile, { kwh, hours, usual, runsPerWeek = 7, window = null }) {
  const wrap = [...profile, ...profile, ...profile];
  const flat = Float64Array.from(wrap);
  const kgAt = (s) => runKg(flat, 0, s, hours, kwh);
  const starts = allowedStarts(hours, window);
  let best = starts[0];
  for (const s of starts) if (kgAt(s) < kgAt(best) - 1e-12) best = s;
  const bestKg = kgAt(best), usualKg = kgAt(usual);
  const runsPerYear = runsPerWeek * DAYS_PER_WEEK_TO_YEAR;
  return { best, bestKg, usualKg, saveKg: usualKg - bestKg, savePct: usualKg > 0 ? (100 * (usualKg - bestKg)) / usualKg : 0, yearlySaveKg: (usualKg - bestKg) * runsPerYear };
}

/** "7 pm", "12 am" style label for a clock hour (0-24). */
export function hourLabel(h) {
  h = ((h % 24) + 24) % 24;
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const ampm = hr < 12 ? "am" : "pm";
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return min ? `${h12}:${String(min).padStart(2, "0")} ${ampm}` : `${h12} ${ampm}`;
}

/** Spread N runs per week over weekdays for a calendar reminder. */
export function weeklyDays(n) {
  const sets = {
    1: ["SA"], 2: ["WE", "SA"], 3: ["MO", "WE", "FR"], 4: ["MO", "WE", "FR", "SU"],
    5: ["MO", "TU", "WE", "TH", "FR"], 6: ["MO", "TU", "WE", "TH", "FR", "SA"],
    7: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
  };
  return sets[Math.max(1, Math.min(7, Math.round(n)))];
}

/**
 * A minimal RFC 5545 calendar with one weekly recurring reminder at the recommended start.
 * Uses floating local time (the device's clock), which is stated in the event text.
 */
export function buildICS({ title, description, startHour, hours, runsPerWeek, now = new Date() }) {
  const pad = (n) => String(n).padStart(2, "0");
  const codes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const byday = weeklyDays(runsPerWeek);
  let next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, startHour, 0, 0);
  // first occurrence must match the RRULE's BYDAY set
  for (let i = 0; i < 7 && !byday.includes(codes[next.getDay()]); i++) {
    next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1, startHour, 0, 0);
  }
  const end = new Date(next.getTime() + hours * 3600 * 1000);
  const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line) => {
    const out = [];
    while (line.length > 74) { out.push(line.slice(0, 74)); line = " " + line.slice(74); }
    out.push(line);
    return out.join("\r\n");
  };
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cleanest Hour//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${stamp}-${startHour}@cleanest-hour`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${fmt(next)}`,
    `DTEND:${fmt(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byday.join(",")}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "TRIGGER:PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
