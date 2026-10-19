// Builds _site/art-therapy-stats.json from the monday.com board
// "2026 Art Therapy Sessions -Paid" (18398883618).
// Run by .github/workflows/update-stats.yml once a day.

import { mkdir, writeFile } from "node:fs/promises";

const BOARD_ID = 18398883618;
const YEAR = process.env.STATS_YEAR || "2026";
const TOKEN = process.env.MONDAY_TOKEN;
if (!TOKEN) throw new Error("MONDAY_TOKEN is not set");

// Board column IDs
const COL = {
  location: "color_mknrnq84",      // Location of Session (status, e.g. "Оде́са (Odesa)")
  date: "date_mknrhwf1",           // Date of Session
  date2: "date_mknsqxan",          // Date of Session (older form version)
  created: "pulse_log_mknrappc",   // Form Submission Time Stamp
  minutes: "numeric_mknrjms7",     // TOTAL Session Duration and "other"
  durationLabel: "color_mknr7tz",  // Duration of Session (30/60/90/120/other)
  // Participant counts by group, summed per session
  teens: "numeric_mknrrqfe",
  veterans: "numeric_mknrt4g0",
  men: "numeric_mknrk8cw",
  women: "numeric_mknry1ja",
  children: "numeric_mknr94bz",
};
const PARTICIPANT_COLS = [COL.teens, COL.veterans, COL.men, COL.women, COL.children];
const COL_IDS = JSON.stringify(Object.values(COL));

const ITEM_FIELDS = `cursor items { id column_values(ids: ${COL_IDS}) { id text } }`;

async function gql(query, variables = {}, attempt = 1) {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API-Version": "2025-04",
      Authorization: TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 5000 * attempt));
      return gql(query, variables, attempt + 1);
    }
    throw new Error(`monday API error (${res.status}): ${JSON.stringify(body.errors || body)}`);
  }
  return body.data;
}

async function fetchAllItems() {
  const items = [];
  let data = await gql(`{ boards(ids: [${BOARD_ID}]) { items_page(limit: 500) { ${ITEM_FIELDS} } } }`);
  let page = data.boards[0].items_page;
  items.push(...page.items);
  while (page.cursor) {
    data = await gql(
      `query ($c: String!) { next_items_page(limit: 500, cursor: $c) { ${ITEM_FIELDS} } }`,
      { c: page.cursor }
    );
    page = data.next_items_page;
    items.push(...page.items);
  }
  return items;
}

const num = (s) => {
  const n = parseFloat(String(s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// "Оде́са (Odesa)" -> "Odesa"
const cityName = (label) => (label.match(/\(([^)]+)\)/)?.[1] || label).trim();

const items = await fetchAllItems();
const totals = {};

for (const item of items) {
  const v = Object.fromEntries(item.column_values.map((c) => [c.id, c.text || ""]));
  const date = v[COL.date] || v[COL.date2] || v[COL.created];
  if (!date.startsWith(YEAR)) continue;
  if (!v[COL.location]) continue;

  const city = cityName(v[COL.location]);
  const t = (totals[city] ??= { participants: 0, sessions: 0, minutesSum: 0, minutesCount: 0 });

  t.sessions += 1;
  t.participants += PARTICIPANT_COLS.reduce((sum, id) => sum + num(v[id]), 0);

  const minutes = num(v[COL.minutes]) || num(v[COL.durationLabel]);
  if (minutes > 0) {
    t.minutesSum += minutes;
    t.minutesCount += 1;
  }
}

const cities = {};
for (const [city, t] of Object.entries(totals).sort()) {
  cities[city] = {
    participants: t.participants,
    sessions: t.sessions,
    avgMinutes: t.minutesCount ? Math.round(t.minutesSum / t.minutesCount) : 0,
  };
}

// Don't publish an empty file if something went wrong upstream;
// failing here keeps yesterday's file live.
const totalSessions = Object.values(cities).reduce((s, c) => s + c.sessions, 0);
if (totalSessions === 0) throw new Error(`No ${YEAR} sessions found; not publishing.`);

const output = { year: Number(YEAR), updatedAt: new Date().toISOString(), cities };

await mkdir("_site", { recursive: true });
await writeFile("_site/art-therapy-stats.json", JSON.stringify(output, null, 2));
console.log(`Read ${items.length} items, ${totalSessions} sessions in ${YEAR}`);
console.table(cities);
