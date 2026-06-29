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
    const allowed = ["Restaurante", "Bar", "Caf\xE9", "Heladera\xEDa"];
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

  it("instagram handles have no @ prefix", () => {
    for (const m of MEALS) {
      if (m.instagram) {
        expect(m.instagram, `${m.id} instagram has @`).not.toMatch(/^@/);
        expect(m.instagram.trim()).not.toBe("");
      }
    }
  });
});

// ── A11Y-01: SectionList uses <ul> not div[role=list] ────────────────────

describe("A11Y-01 semantic list markup", () => {
  it("SectionList renders ul, not div with role=list", () => {
    expect(html).toMatch(/createElement\("ul"/);
  });

  it("no div with role=list exists in JS", () => {
    // Ensure the old anti-pattern was removed
    expect(html).not.toMatch(/role:\s*["']list["']/);
  });

  it("no button with role=listitem exists in JS", () => {
    expect(html).not.toMatch(/role:\s*["']listitem["']/);
  });
});
