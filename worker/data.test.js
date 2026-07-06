/**
 * Data integrity tests — extracts data arrays from main.html using regex
 * and evaluates them with new Function to avoid full DOM/React execution.
 */
import { describe, it, expect } from "vitest";
import { readFileSync }  from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const html  = readFileSync(join(__dir, "../main.html"), "utf-8");

// Extract the largest <script> tag
const allScripts = [...html.matchAll(/<script(?:\s[^>]*)?>(.+?)<\/script>/gs)];
const js = allScripts.reduce((a, b) => (a[1].length > b[1].length ? a : b))[1];

/**
 * Extracts a `const NAME = [...]` or `const NAME = {...}` declaration from
 * the JS source and evaluates just the right-hand side with new Function.
 */
function extractData(source, varName) {
  const marker = `const ${varName} = `;
  const start  = source.indexOf(marker);
  if (start < 0) return undefined;

  let i = start + marker.length;
  let depth = 0, inStr = false, strChar = "";

  for (; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (ch === "\\") { i++; continue; }       // skip escaped char
      if (ch === strChar) inStr = false;
    } else {
      if (ch === '"' || ch === "'") { inStr = true; strChar = ch; }
      else if ("[{(".includes(ch)) depth++;
      else if ("]})".includes(ch)) { if (--depth < 0) break; }
      else if (depth === 0 && ch === ";") break;
    }
  }

  const expr = source.slice(start + marker.length, i);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${expr})`)();
}

const FLIGHTS         = extractData(js, "FLIGHTS");
const STAYS           = extractData(js, "STAYS");
const ACTIVITIES      = extractData(js, "ACTIVITIES");
const MUSEUMS         = extractData(js, "MUSEUMS");
const SHOPPINGS       = extractData(js, "SHOPPINGS");
const MEALS           = extractData(js, "MEALS");
const AREA_COORDS_SP  = extractData(js, "AREA_COORDS_SP");
const AREA_COORDS_RJ  = extractData(js, "AREA_COORDS_RJ");

// ── FLIGHTS ──────────────────────────────────────────────────────────────────

describe("FLIGHTS data integrity", () => {
  it("extracted correctly (not undefined)", () => expect(FLIGHTS).toBeDefined());
  it("has at least 3 flight segments", () => expect(FLIGHTS.length).toBeGreaterThanOrEqual(3));

  it("every flight has required fields", () => {
    for (const f of FLIGHTS) {
      expect(f.id,           `${f.id} missing id`).toBeTruthy();
      expect(f.flightNumber, `${f.id} missing flightNumber`).toBeTruthy();
      expect(f.isoDate,      `${f.id} missing isoDate`).toBeTruthy();
      expect(f.dep,          `${f.id} missing dep`).toBeTruthy();
      expect(f.arr,          `${f.id} missing arr`).toBeTruthy();
      expect(f.passengers,   `${f.id} missing passengers`).toBeTruthy();
    }
  });

  it("every isoDate is a valid YYYY-MM-DD", () => {
    for (const f of FLIGHTS) {
      expect(f.isoDate, `${f.id} invalid isoDate`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("all flights are within July 2026", () => {
    for (const f of FLIGHTS) {
      expect(f.isoDate.startsWith("2026-07")).toBe(true);
    }
  });

  it("dep and arr have city, IATA code, and HH:MM time", () => {
    for (const f of FLIGHTS) {
      expect(f.dep.city).toBeTruthy();
      expect(f.dep.code, `${f.id} dep.code`).toMatch(/^[A-Z]{3}$/);
      expect(f.dep.time, `${f.id} dep.time`).toMatch(/^\d{2}:\d{2}$/);
      expect(f.arr.city).toBeTruthy();
      expect(f.arr.code, `${f.id} arr.code`).toMatch(/^[A-Z]{3}$/);
      expect(f.arr.time, `${f.id} arr.time`).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("ids are unique", () => {
    const ids = FLIGHTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── STAYS ─────────────────────────────────────────────────────────────────────

describe("STAYS data integrity", () => {
  it("extracted correctly", () => expect(STAYS).toBeDefined());
  it("has at least 3 stays", () => expect(STAYS.length).toBeGreaterThanOrEqual(3));

  it("every stay has id, name, city, address, mapsUrl", () => {
    for (const s of STAYS) {
      expect(s.id,      `${s.id} missing id`).toBeTruthy();
      expect(s.name,    `${s.id} missing name`).toBeTruthy();
      expect(s.city,    `${s.id} missing city`).toBeTruthy();
      expect(s.address, `${s.id} missing address`).toBeTruthy();
      expect(s.mapsUrl, `${s.id} missing mapsUrl`).toBeTruthy();
    }
  });

  it("all mapsUrls start with https://", () => {
    for (const s of STAYS) {
      expect(s.mapsUrl).toMatch(/^https:\/\//);
    }
  });

  it("ids are unique", () => {
    const ids = STAYS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── ACTIVITIES ────────────────────────────────────────────────────────────────

describe("ACTIVITIES data integrity", () => {
  it("extracted correctly", () => expect(ACTIVITIES).toBeDefined());

  it("has at least 10 activities per main city", () => {
    const sp = ACTIVITIES.filter((a) => a.city.includes("Paulo"));
    const rj = ACTIVITIES.filter((a) => a.city.includes("Rio"));
    expect(sp.length, "São Paulo activities").toBeGreaterThanOrEqual(10);
    expect(rj.length, "Rio activities").toBeGreaterThanOrEqual(10);
  });

  it("every activity has id, name, city, rating", () => {
    for (const a of ACTIVITIES) {
      expect(a.id,     `${a.id} missing id`).toBeTruthy();
      expect(a.name,   `${a.id} missing name`).toBeTruthy();
      expect(a.city,   `${a.id} missing city`).toBeTruthy();
      expect(a.rating, `${a.id} missing rating`).toBeTruthy();
    }
  });

  it("all activities have rating ≥ 4.0", () => {
    for (const a of ACTIVITIES) {
      expect(parseFloat(a.rating), `${a.id} rating ${a.rating}`).toBeGreaterThanOrEqual(4.0);
    }
  });

  it("ids are unique", () => {
    const ids = ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── MUSEUMS ───────────────────────────────────────────────────────────────────

describe("MUSEUMS data integrity", () => {
  it("extracted correctly", () => expect(MUSEUMS).toBeDefined());

  it("has at least 5 museums per city", () => {
    const sp = MUSEUMS.filter((m) => m.city.includes("Paulo"));
    const rj = MUSEUMS.filter((m) => m.city.includes("Rio"));
    expect(sp.length, "São Paulo museums").toBeGreaterThanOrEqual(5);
    expect(rj.length, "Rio museums").toBeGreaterThanOrEqual(5);
  });

  it("every museum has id, name, city, hours, ticket", () => {
    for (const m of MUSEUMS) {
      expect(m.id,     `${m.id} missing id`).toBeTruthy();
      expect(m.name,   `${m.id} missing name`).toBeTruthy();
      expect(m.city,   `${m.id} missing city`).toBeTruthy();
      expect(m.hours,  `${m.id} missing hours`).toBeTruthy();
      expect(m.ticket, `${m.id} missing ticket`).toBeTruthy();
    }
  });

  it("ids are unique", () => {
    const ids = MUSEUMS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── SHOPPINGS ─────────────────────────────────────────────────────────────────

describe("SHOPPINGS data integrity", () => {
  it("extracted correctly", () => expect(SHOPPINGS).toBeDefined());

  it("has at least 5 shoppings per city", () => {
    const sp = SHOPPINGS.filter((s) => s.city.includes("Paulo"));
    const rj = SHOPPINGS.filter((s) => s.city.includes("Rio"));
    expect(sp.length, "São Paulo shoppings").toBeGreaterThanOrEqual(5);
    expect(rj.length, "Rio shoppings").toBeGreaterThanOrEqual(5);
  });

  it("every shopping has id, name, city, hours", () => {
    for (const s of SHOPPINGS) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.city).toBeTruthy();
      expect(s.hours).toBeTruthy();
    }
  });

  it("ids are unique", () => {
    const ids = SHOPPINGS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── MEALS ─────────────────────────────────────────────────────────────────────

describe("MEALS data integrity", () => {
  it("extracted correctly", () => expect(MEALS).toBeDefined());

  it("has at least 5 meals per city", () => {
    const sp = MEALS.filter((m) => m.city.includes("Paulo"));
    const rj = MEALS.filter((m) => m.city.includes("Rio"));
    expect(sp.length, "São Paulo meals").toBeGreaterThanOrEqual(5);
    expect(rj.length, "Rio meals").toBeGreaterThanOrEqual(5);
  });

  it("every meal has id, name, city, category, rating", () => {
    for (const m of MEALS) {
      expect(m.id,       `${m.id} missing id`).toBeTruthy();
      expect(m.name,     `${m.id} missing name`).toBeTruthy();
      expect(m.city,     `${m.id} missing city`).toBeTruthy();
      expect(m.category, `${m.id} missing category`).toBeTruthy();
      expect(m.rating,   `${m.id} missing rating`).toBeTruthy();
    }
  });

  it("all meals have rating ≥ 4.4 (gastronomy guidelines)", () => {
    for (const m of MEALS) {
      expect(
        parseFloat(m.rating),
        `${m.id} "${m.name}" has rating ${m.rating} (< 4.4)`
      ).toBeGreaterThanOrEqual(4.4);
    }
  });

  it("all categories are valid", () => {
    const allowed = ["Restaurante", "Bar", "Caf\xE9", "Helader\xEDa"]; // 4 categorías vigentes (ver memory/project_gastronomy_guidelines.md)
    for (const m of MEALS) {
      expect(allowed, `${m.id} invalid category "${m.category}"`).toContain(m.category);
    }
  });

  it("all moments are valid", () => {
    const valid = ["Ma\xF1ana", "Almuerzo", "Brunch", "Tarde", "Cena", "Noche"];
    for (const m of MEALS) {
      expect(valid, `${m.id} invalid moment "${m.moment}"`).toContain(m.moment);
    }
  });

  it("ids are unique", () => {
    const ids = MEALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each city+category group is sorted by rating descending", () => {
    const cities = [...new Set(MEALS.map((m) => m.city))];
    const cats   = [...new Set(MEALS.map((m) => m.category))];
    for (const city of cities) {
      for (const cat of cats) {
        const group = MEALS.filter((m) => m.city === city && m.category === cat);
        for (let i = 1; i < group.length; i++) {
          const prev = parseFloat(group[i - 1].rating) || 0;
          const curr = parseFloat(group[i].rating) || 0;
          expect(curr, `${city}/${cat}: item ${i} (${group[i].name} ${curr}) debe ser ≤ item ${i-1} (${group[i-1].name} ${prev})`).toBeLessThanOrEqual(prev);
        }
      }
    }
  });

  it("instagram handles have no @ prefix", () => {
    for (const m of MEALS) {
      if (m.instagram) {
        expect(m.instagram, `${m.id} instagram has @`).not.toMatch(/^@/);
        expect(m.instagram.trim()).not.toBe("");
      }
    }
  });
});

// ── MAP-01: area coords coverage ─────────────────────────────────────────
// Catches venues whose `area` field has no entry in AREA_COORDS_SP/RJ,
// which makes the map point invisible (no centroid to place the pin).

describe("MAP-01 area coords coverage", () => {
  const allPOIs = [
    ...ACTIVITIES.map((x) => ({ ...x, section: "ACTIVITIES" })),
    ...MUSEUMS.map((x)    => ({ ...x, section: "MUSEUMS" })),
    ...SHOPPINGS.map((x)  => ({ ...x, section: "SHOPPINGS" })),
    ...MEALS.map((x)      => ({ ...x, section: "MEALS" })),
  ];

  it("every POI area exists in AREA_COORDS_SP or AREA_COORDS_RJ", () => {
    const missing = allPOIs.filter((item) => {
      const coords = item.city.includes("Paulo") ? AREA_COORDS_SP : AREA_COORDS_RJ;
      return !coords[item.area];
    });
    expect(
      missing.map((m) => `[${m.section}] ${m.id} "${m.name}" area="${m.area}"`),
      "POIs with unmapped area (invisible on map)"
    ).toEqual([]);
  });
});

// ── CROSS-01: globally unique IDs ─────────────────────────────────────────
// Catches duplicate IDs within a section (e.g. two me_r_rj05 entries after
// a bad insertion). Each section already has its own uniqueness test; this
// one catches cross-section prefix collisions too.

describe("CROSS-01 globally unique IDs", () => {
  it("all IDs across ACTIVITIES, MUSEUMS, SHOPPINGS, MEALS are unique", () => {
    const all = [
      ...ACTIVITIES.map((x) => x.id),
      ...MUSEUMS.map((x)    => x.id),
      ...SHOPPINGS.map((x)  => x.id),
      ...MEALS.map((x)      => x.id),
    ];
    const dupes = all.filter((id, i) => all.indexOf(id) !== i);
    expect(dupes, `duplicate IDs: ${[...new Set(dupes)].join(", ")}`).toEqual([]);
  });
});

// ── SECTION-01: hint text matches actual counts ─���─────────────────────────
// The section subtitle hints (e.g. "15 por ciudad · SP & RJ") are shown in
// the UI. These tests ensure the hints stay consistent with the real data
// so a stale label doesn't mislead the user.
//
// EXPECTED counts (update here if you intentionally change the data size):
const EXPECTED = {
  activitiesPerCity:   30,
  museumsPerCity:      15,
  shoppingsPerCity:    12,
  mealsPerCityPerCat: { Restaurante: 20, Bar: 20, "Caf\xE9": 20, "Helader\xEDa": 10 },
};

describe("SECTION-01 data counts match UI hints", () => {
  it(`ACTIVITIES: ${EXPECTED.activitiesPerCity} per city`, () => {
    const sp = ACTIVITIES.filter((a) => a.city.includes("Paulo")).length;
    const rj = ACTIVITIES.filter((a) => a.city.includes("Rio")).length;
    expect(sp, "SP activities").toBe(EXPECTED.activitiesPerCity);
    expect(rj, "RJ activities").toBe(EXPECTED.activitiesPerCity);
  });

  it(`MUSEUMS: ${EXPECTED.museumsPerCity} per city`, () => {
    const sp = MUSEUMS.filter((m) => m.city.includes("Paulo")).length;
    const rj = MUSEUMS.filter((m) => m.city.includes("Rio")).length;
    expect(sp, "SP museums").toBe(EXPECTED.museumsPerCity);
    expect(rj, "RJ museums").toBe(EXPECTED.museumsPerCity);
  });

  it(`SHOPPINGS: ${EXPECTED.shoppingsPerCity} per city`, () => {
    const sp = SHOPPINGS.filter((s) => s.city.includes("Paulo")).length;
    const rj = SHOPPINGS.filter((s) => s.city.includes("Rio")).length;
    expect(sp, "SP shoppings").toBe(EXPECTED.shoppingsPerCity);
    expect(rj, "RJ shoppings").toBe(EXPECTED.shoppingsPerCity);
  });

  it("MEALS: each city+category matches expected count", () => {
    const cities = ["S\xE3o Paulo", "Rio de Janeiro"];
    for (const city of cities) {
      for (const [cat, expectedCount] of Object.entries(EXPECTED.mealsPerCityPerCat)) {
        const count = MEALS.filter((m) => m.city === city && m.category === cat).length;
        expect(count, `${city} / ${cat}`).toBe(expectedCount);
      }
    }
  });

  it("section hint strings in JS contain the correct counts", () => {
    expect(js, "museos hint").toMatch(/museos.*?hint.*?15 por ciudad/s);
    expect(js, "shoppings hint").toMatch(/shoppings.*?hint.*?12 por ciudad/s);
    expect(js, "actividades hint").toMatch(/actividades.*?hint.*?30 por ciudad/s);
  });

  it("SECTIONS meta strings in JS contain the correct counts", () => {
    // SECTIONS is the home-screen summary array — a separate source of truth
    // from the per-section hint strings. Both must stay in sync with data counts.
    expect(js, "SECTIONS museos meta").toMatch(/museos.*?meta.*?15 por ciudad/s);
    expect(js, "SECTIONS shoppings meta").toMatch(/shoppings.*?meta.*?12 por ciudad/s);
    expect(js, "SECTIONS actividades meta").toMatch(/actividades.*?meta.*?30 por ciudad/s);
  });
});

// ── JS syntax validity ────────────────────────────────────────────────────
// Catches SyntaxError (e.g. paren imbalance) before it hits the browser.
// Note: new Function(js) makes top-level `var` declarations function-local
// instead of global — safe here because all application code lives in a
// single self-contained <script> tag with no cross-tag var references.

describe("main.html JS syntax", () => {
  it("largest script block has no syntax errors", () => {
    expect(() => new Function(js)).not.toThrow();
  });
});

// ── CODE-07 structural integrity ──────────────────────────────────────────

describe("CODE-07 filterAndSort + OpenNowBtn structure", () => {
  it("filterAndSort is called at least 4 times (once per content section)", () => {
    const calls = [...js.matchAll(/filterAndSort\(/g)];
    expect(calls.length, "expected ≥4 calls to filterAndSort").toBeGreaterThanOrEqual(4);
  });

  it("OpenNowBtn appears at least 5 times (definition + 4 usages)", () => {
    const uses = [...js.matchAll(/OpenNowBtn/g)];
    expect(uses.length).toBeGreaterThanOrEqual(5);
  });

  // Returns the JS slice for a section — from its marker to the next section's marker.
  // Avoids a fixed-size window that can silently miss content when sections grow.
  function sectionChunk(section) {
    const ORDER = ["actividades", "museos", "shoppings", "comidas"];
    const idx = js.indexOf(`active === "${section}"`);
    const next = ORDER[ORDER.indexOf(section) + 1];
    const end  = next ? js.indexOf(`active === "${next}"`) : js.length;
    return { idx, chunk: js.slice(idx, end > idx ? end : js.length) };
  }

  it.each(["actividades", "museos", "shoppings", "comidas"])(
    "%s section: OpenNowBtn appears before visibleCities.map",
    (section) => {
      const { idx, chunk } = sectionChunk(section);
      expect(idx, `active === "${section}" not found in JS`).toBeGreaterThan(0);
      const onIdx  = chunk.indexOf("OpenNowBtn");
      const mapIdx = chunk.indexOf("visibleCities.map");
      expect(onIdx,  `${section}: OpenNowBtn missing after section marker`).toBeGreaterThan(0);
      expect(mapIdx, `${section}: visibleCities.map missing after section marker`).toBeGreaterThan(0);
      expect(onIdx,  `${section}: OpenNowBtn must come before visibleCities.map`).toBeLessThan(mapIdx);
    }
  );

  it.each(["actividades", "museos", "shoppings", "comidas"])(
    "%s section: filterAndSort appears inside visibleCities.map callback",
    (section) => {
      const { chunk } = sectionChunk(section);
      const mapIdx = chunk.indexOf("visibleCities.map");
      const fsIdx  = chunk.indexOf("filterAndSort(", mapIdx);
      expect(fsIdx, `${section}: filterAndSort not found after visibleCities.map`).toBeGreaterThan(mapIdx);
    }
  );
});

// ── A11Y-01: SectionList uses <ul> not div[role=list] ────────────────────

describe("A11Y-01 semantic list markup", () => {
  it("SectionList renders ul with role='list' (required for VoiceOver on iOS/Safari with list-style:none)", () => {
    expect(html).toMatch(/createElement\("ul",\s*\{\s*role:\s*["']list["']/);
  });

  it("no div carries role='list' (semantic markup is on the ul)", () => {
    expect(html).not.toMatch(/createElement\("div"[^)]{0,80}role:\s*["']list["']/);
  });

  it("no button with role=listitem exists in JS", () => {
    expect(html).not.toMatch(/role:\s*["']listitem["']/);
  });
});
