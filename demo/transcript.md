# Demo transcript

Cleanest Hour walkthrough, 2 min 28 s, 1280×800, recorded with Playwright against the live site (https://bowen1314.github.io/cleanest-hour/) on 2026-10-24. There is no voice-over; the captions below appear on screen. Numbers in captions were read from the app while recording.

| Time | On-screen caption |
|---|---|
| 0:01 | Cleanest Hour: when should I run it? It finds the hour your grid burns the least fossil fuel for appliances you can shift. |
| 0:08 | It uses 12 months of real hourly grid data (EIA-930, Oct 2025 – Sep 2026) and EPA eGRID emission factors. No account needed, and it works offline. |
| 0:16 | Step 1: pick your grid. Not sure which one you're on? Search by state. New Jersey is on PJM. |
| 0:22 | Step 2: pick an appliance. EV charging: about 40 miles' worth, 14 kWh over 2 hours (DOE figures; you can edit them). |
| 0:28 | Result: Start at 12 pm. 4.49 kg CO2e per charge, versus 4.98 kg at 7 pm (10% less). |
| 0:35 | At 5 charges a week that's 128 kg less CO2e a year. Starting at 12 pm was cleaner than 7 pm on 355 of 364 actual days, so the habit holds up on real days, not just on average. |
| 0:44 | Why noon? This is PJM's average carbon intensity for each hour of the day. Your usual 7 pm run is orange, the recommended run is blue. |
| 0:53 | The generation mix behind it: at noon solar supplies about 9% of PJM's power vs 1% at 7 pm, and gas drops from 43% to 39%. |
| 1:02 | Car only home at night? Restrict the window to 10 pm – 7 am: Start at 3 am, 63.8 kg less a year. |
| 1:09 | Now California. "Charge overnight" is common advice, but here the best overnight start emits 2.33 kg, versus 2.30 kg at 7 pm (1% more). On a solar-heavy grid, night isn't cleaner. |
| 1:19 | Allow any time and the answer flips: Start at 10 am, 1.05 kg per charge versus 2.30 kg at 7 pm (54% less): 326 kg less a year. |
| 1:27 | The solar dip is obvious on California's grid. The lines show the spread across the middle 80% of days. |
| 1:34 | How much does timing matter elsewhere? Same EV and 7 pm habit on 31 U.S. grids. Solar-heavy grids reward shifting the most. |
| 1:43 | Back to New Jersey. The best hour shifts with the seasons, so here's the plan for each one. |
| 1:51 | Turn it into a habit: download a weekly calendar reminder (.ics), or copy a link that reopens this exact plan. |
| 1:59 | How this is calculated: generation by source × eGRID factor for each hour, then averaged over the hours your run covers. The factors for PJM are listed. |
| 2:09 | Limitations, stated plainly: these are average emissions, not marginal ones; it's history, not a forecast; imports aren't traced; and smokestack emissions only, no lifecycle. |
| 2:19 | Cleanest Hour is open source (MIT) and uses public-domain U.S. government data: github.com/Bowen1314/cleanest-hour |
