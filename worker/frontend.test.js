import { describe, it, expect, vi } from "vitest";
import {
  esc,
  normalizeUrl,
  localTime,
  fade,
  accentForDark,
  matchesSearch,
  wmoInfo,
  fmtDay,
  momentToHours,
  parseBRLNum,
  extractPrices,
  _parseBRL,
  _cosSim,
  getDaysUntil,
  filterAndSort,
} from "./frontend-utils.js";

// ── esc ──────────────────────────────────────────────────────────────────────

describe("esc", () => {
  it("escapes &", () => expect(esc("a & b")).toBe("a &amp; b"));
  it("escapes <", () => expect(esc("<script>")).toBe("&lt;script&gt;"));
  it("escapes >", () => expect(esc("1 > 0")).toBe("1 &gt; 0"));
  it('escapes "', () => expect(esc(`say "hi"`)).toBe("say &quot;hi&quot;"));
  it("leaves safe strings alone", () => expect(esc("hello world")).toBe("hello world"));
  it("handles null/undefined gracefully", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
  it("handles numbers", () => expect(esc(42)).toBe("42"));
  it("escapes all special chars in one string", () =>
    expect(esc(`<a href="x&y">`)).toBe("&lt;a href=&quot;x&amp;y&quot;&gt;"));
});

// ── normalizeUrl ─────────────────────────────────────────────────────────────

describe("normalizeUrl", () => {
  it("leaves https URLs unchanged", () =>
    expect(normalizeUrl("https://example.com")).toBe("https://example.com"));
  it("leaves http URLs unchanged", () =>
    expect(normalizeUrl("http://example.com")).toBe("http://example.com"));
  it("prepends https:// to bare domains", () =>
    expect(normalizeUrl("example.com")).toBe("https://example.com"));
  it("returns null for null input", () => expect(normalizeUrl(null)).toBeNull());
  it("returns null for empty string", () => expect(normalizeUrl("")).toBeNull());
  it("returns null for undefined", () => expect(normalizeUrl(undefined)).toBeNull());
});

// ── localTime ────────────────────────────────────────────────────────────────

// localTime extracts HH:MM from flight-API strings like "13:05-03:00"
// (not full ISO datetimes — the regex matches the first XX:XX[-+] pattern)
describe("localTime", () => {
  it("extracts time from offset string HH:MM-ZZ:ZZ", () =>
    expect(localTime("13:05-03:00")).toBe("13:05"));
  it("extracts time from offset string HH:MM+ZZ:ZZ", () =>
    expect(localTime("14:30+00:00")).toBe("14:30"));
  it("extracts time embedded in longer flight-API strings", () =>
    expect(localTime("departure: 22:15-03:00")).toBe("22:15"));
  it("returns null for null input", () => expect(localTime(null)).toBeNull());
  it("returns null for empty string", () => expect(localTime("")).toBeNull());
  it("returns null when no [-+] offset separator is present", () =>
    expect(localTime("2026-07-09T11:20:00Z")).toBeNull());
});

// ── fade ─────────────────────────────────────────────────────────────────────

describe("fade", () => {
  const light = { baseRGB: "41,38,27", dark: false };
  const dark  = { baseRGB: "255,255,255", dark: true };

  it("returns rgba string with given alpha in light mode", () =>
    expect(fade(light, 0.5)).toBe("rgba(41,38,27,0.5)"));
  it("passes through alpha < 0.3 in dark mode unchanged", () =>
    expect(fade(dark, 0.1)).toBe("rgba(255,255,255,0.1)"));
  it("clamps alpha 0.3–0.52 to 0.52 in dark mode", () => {
    expect(fade(dark, 0.3)).toBe("rgba(255,255,255,0.52)");
    expect(fade(dark, 0.45)).toBe("rgba(255,255,255,0.52)");
    expect(fade(dark, 0.51)).toBe("rgba(255,255,255,0.52)");
  });
  it("does NOT clamp 0.52 in dark mode", () =>
    expect(fade(dark, 0.52)).toBe("rgba(255,255,255,0.52)"));
  it("passes through alpha > 0.52 in dark mode unchanged", () =>
    expect(fade(dark, 0.8)).toBe("rgba(255,255,255,0.8)"));
});

// ── accentForDark ─────────────────────────────────────────────────────────────

describe("accentForDark", () => {
  it("returns a hex string", () => {
    expect(accentForDark("#0E6B70")).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("lightens a dark colour (result channels ≥ input channels)", () => {
    const result = accentForDark("#0E6B70");
    const rIn = 0x0e, gIn = 0x6b, bIn = 0x70;
    const rOut = parseInt(result.slice(1, 3), 16);
    const gOut = parseInt(result.slice(3, 5), 16);
    const bOut = parseInt(result.slice(5, 7), 16);
    expect(rOut).toBeGreaterThan(rIn);
    expect(gOut).toBeGreaterThan(gIn);
    expect(bOut).toBeGreaterThan(bIn);
  });
  it("is idempotent in structure (always 7-char hex)", () => {
    expect(accentForDark("#000000")).toHaveLength(7);
    expect(accentForDark("#ffffff")).toHaveLength(7);
  });
});

// ── matchesSearch ─────────────────────────────────────────────────────────────

describe("matchesSearch", () => {
  const item = { name: "Parque Ibirapuera", note: "lago y ciclovia", kind: "Parque urbano", area: "Moema" };

  it("returns true for empty query", () =>
    expect(matchesSearch(item, "")).toBe(true));
  it("returns true for whitespace-only query", () =>
    expect(matchesSearch(item, "   ")).toBe(true));
  it("matches on name (case-insensitive)", () =>
    expect(matchesSearch(item, "ibirapuera")).toBe(true));
  it("matches on note", () =>
    expect(matchesSearch(item, "ciclovia")).toBe(true));
  it("matches on kind", () =>
    expect(matchesSearch(item, "urbano")).toBe(true));
  it("matches on area", () =>
    expect(matchesSearch(item, "moema")).toBe(true));
  it("returns false when no field matches", () =>
    expect(matchesSearch(item, "pizza")).toBe(false));
  it("handles missing fields gracefully", () =>
    expect(matchesSearch({ name: "Test" }, "test")).toBe(true));
  it("handles all-undefined item", () =>
    expect(matchesSearch({}, "test")).toBe(false));
});

// ── wmoInfo ──────────────────────────────────────────────────────────────────

describe("wmoInfo", () => {
  it.each([
    [0,  "Despejado",            "sun"    ],
    [1,  "Parcialmente nublado", "partly" ],
    [2,  "Parcialmente nublado", "partly" ],
    [3,  "Nublado",              "cloud"  ],
    [45, "Niebla",               "fog"    ],
    [51, "Llovizna",             "drizzle"],
    [61, "Lluvia",               "rain"   ],
    [80, "Chubascos",            "rain"   ],
    [95, "Tormenta",             "storm"  ],
    [99, "Tormenta",             "storm"  ],
    [100,"Variable",             "partly" ],
  ])("code %d → label=%s type=%s", (code, label, type) => {
    const info = wmoInfo(code);
    expect(info.label).toBe(label);
    expect(info.type).toBe(type);
  });
});

// ── fmtDay ───────────────────────────────────────────────────────────────────

describe("fmtDay", () => {
  it("formats a known date correctly", () => {
    // 2026-07-08 is a Wednesday — Miércoles → "Mié"
    const r = fmtDay("2026-07-08");
    expect(r.d).toBe(8);
    expect(r.mon).toBe("jul");
    expect(r.dow).toBe("Mié");
  });
  it("formats a Sunday correctly", () => {
    // 2026-07-19 is a Sunday → "Dom"
    const r = fmtDay("2026-07-19");
    expect(r.dow).toBe("Dom");
    expect(r.mon).toBe("jul");
    expect(r.d).toBe(19);
  });
  it("formats January correctly", () => {
    const r = fmtDay("2026-01-01");
    expect(r.mon).toBe("ene");
    expect(r.d).toBe(1);
  });
  it("formats December correctly", () => {
    const r = fmtDay("2026-12-31");
    expect(r.mon).toBe("dic");
    expect(r.d).toBe(31);
  });
});

// ── momentToHours ────────────────────────────────────────────────────────────

describe("momentToHours", () => {
  it.each([
    ["Mañana",   "Todos los días 07:00-12:00"],
    ["Almuerzo", "Todos los días 12:00-15:30"],
    ["Brunch",   "Todos los días 09:00-16:00"],
    ["Tarde",    "Todos los días 15:00-20:00"],
    ["Cena",     "Todos los días 19:00-23:30"],
    ["Noche",    "Todos los días 20:00-02:00"],
  ])("%s → %s", (input, expected) => {
    expect(momentToHours(input)).toBe(expected);
  });
  it("returns null for unknown moment", () =>
    expect(momentToHours("Madrugada")).toBeNull());
  it("returns null for empty string", () =>
    expect(momentToHours("")).toBeNull());
});

// ── parseBRLNum ──────────────────────────────────────────────────────────────

describe("parseBRLNum", () => {
  it.each([
    ["149,00",      149  ],
    ["R$ 149,00",   149  ],
    ["1.234,98",    1234.98],
    ["9.999,99",    9999.99],
    ["50",          50   ],
  ])("parses '%s' → %d", (input, expected) => {
    expect(parseBRLNum(input)).toBeCloseTo(expected, 1);
  });
  it("returns null for zero", () => expect(parseBRLNum("0,00")).toBeNull());
  it("returns null for non-numeric", () => expect(parseBRLNum("abc")).toBeNull());
  it("returns null for empty string", () => expect(parseBRLNum("")).toBeNull());
});

// ── extractPrices ─────────────────────────────────────────────────────────────

describe("extractPrices", () => {
  it("extracts R$ price", () => {
    expect(extractPrices("Total: R$ 149,00")).toContain(149);
  });
  it("extracts multiple prices sorted ascending", () => {
    const prices = extractPrices("R$ 50,00 e R$ 149,00");
    expect(prices).toEqual([50, 149]);
  });
  it("extracts thousand-separated price", () => {
    const prices = extractPrices("1.234,98");
    expect(prices).toContain(1234.98);
  });
  it("deduplicates repeated prices", () => {
    const prices = extractPrices("R$ 99,00 e R$ 99,00");
    expect(prices).toHaveLength(1);
  });
  it("returns empty array for no prices", () => {
    expect(extractPrices("sem pre\xE7o aqui")).toEqual([]);
  });
  it("ignores prices over 99999", () => {
    const prices = extractPrices("100000,00");
    expect(prices).toEqual([]);
  });
});

// ── _parseBRL ─────────────────────────────────────────────────────────────────

describe("_parseBRL (OCR output parser)", () => {
  it.each([
    ["149,00",   149    ],  // comma decimal → 2 digits after last sep
    ["149.00",   149    ],  // dot decimal → 2 digits after last sep
    ["1234,98",  1234.98],
    ["1234.98",  1234.98],
    ["1.234,98", 1234.98],  // BRL format: dot=thousands, comma=decimal
    ["1,234.98", 1234.98],  // US format: comma=thousands, dot=decimal
    ["87534,89", 87534.89],
    ["14900",    14900  ],  // no separator → treated as integer 14900
    ["1000",     1000   ],  // no separator
  ])("'%s' → %d", (input, expected) => {
    expect(_parseBRL(input)).toBeCloseTo(expected, 1);
  });
  it("returns null for empty string", () => expect(_parseBRL("")).toBeNull());
  it("returns null for zero", () => expect(_parseBRL("0,00")).toBeNull());
  it("returns null for letters only", () => expect(_parseBRL("abc")).toBeNull());
});

// ── _cosSim ──────────────────────────────────────────────────────────────────

describe("_cosSim", () => {
  it("returns 1 for identical vectors", () => {
    expect(_cosSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it("returns 0 for orthogonal vectors", () => {
    expect(_cosSim([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it("returns 0 for zero vector", () => {
    expect(_cosSim([0, 0], [1, 2])).toBe(0);
  });
  it("returns value in [0,1] for non-negative vectors", () => {
    const sim = _cosSim([1, 0.5, 0.8], [0.9, 0.6, 0.7]);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
  });
  it("handles vectors of length 1", () => {
    expect(_cosSim([4], [4])).toBeCloseTo(1, 5);
  });
});

// ── getDaysUntil ──────────────────────────────────────────────────────────────

describe("getDaysUntil", () => {
  it("returns 0 when target date is today", () => {
    const today = new Date(2026, 6, 8); // Jul 8 2026
    expect(getDaysUntil("08.07.2026", today)).toBe(0);
  });
  it("returns positive when date is in the future", () => {
    const ref = new Date(2026, 6, 1); // Jul 1
    expect(getDaysUntil("08.07.2026", ref)).toBe(7);
  });
  it("returns negative when date is in the past", () => {
    const ref = new Date(2026, 6, 15); // Jul 15
    expect(getDaysUntil("08.07.2026", ref)).toBe(-7);
  });
  it("handles year boundary", () => {
    const ref = new Date(2025, 11, 31); // Dec 31 2025
    expect(getDaysUntil("01.01.2026", ref)).toBe(1);
  });
});

// ── filterAndSort ─────────────────────────────────────────────────────────

const SAMPLE_DATA = [
  { id: "a1", city: "São Paulo", category: "Restaurante", name: "Alpha", rating: "4.6", hours: "12:00-23:00" },
  { id: "a2", city: "São Paulo", category: "Bar",         name: "Beta",  rating: "4.8", hours: "17:00-02:00" },
  { id: "a3", city: "São Paulo", category: "Café",        name: "Gamma", rating: "4.5", hours: "08:00-18:00" },
  { id: "a4", city: "Rio de Janeiro", category: "Restaurante", name: "Delta", rating: "4.7", hours: "12:00-22:00" },
  { id: "a5", city: "São Paulo", category: "Restaurante", name: "zeta",  rating: "4.9", hours: "18:00-23:00" },
];

describe("filterAndSort", () => {
  it("filters by city", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", [], "", false, (x) => x.hours);
    expect(result.every((x) => x.city === "São Paulo")).toBe(true);
    expect(result.length).toBe(4);
  });

  it("returns empty array when city has no matches", () => {
    const result = filterAndSort(SAMPLE_DATA, "Curitiba", [], "", false, (x) => x.hours);
    expect(result).toHaveLength(0);
  });

  it("filters by catFilter when provided", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", ["Bar"], "", false, (x) => x.hours);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a2");
  });

  it("allows multiple categories in catFilter", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", ["Bar", "Café"], "", false, (x) => x.hours);
    expect(result).toHaveLength(2);
    expect(result.map((x) => x.category).sort()).toEqual(["Bar", "Café"].sort());
  });

  it("ignores catFilter when empty array", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", [], "", false, (x) => x.hours);
    expect(result).toHaveLength(4);
  });

  it("filters by searchText (name match)", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", [], "alpha", false, (x) => x.hours);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
  });

  it("returns all items when searchText is empty", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", [], "", false, (x) => x.hours);
    expect(result).toHaveLength(4);
  });

  it("sorts by rating descending", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", [], "", false, (x) => x.hours);
    const ratings = result.map((x) => parseFloat(x.rating));
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1]);
    }
  });

  it("highest-rated item is first", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", [], "", false, (x) => x.hours);
    expect(result[0].id).toBe("a5"); // rating 4.9
  });

  it("openNow=false skips the isOpenNowFn check", () => {
    const alwaysOpen = vi.fn(() => true);
    filterAndSort(SAMPLE_DATA, "São Paulo", [], "", false, (x) => x.hours, alwaysOpen);
    expect(alwaysOpen).not.toHaveBeenCalled();
  });

  it("openNow=true passes getHours result to isOpenNowFn", () => {
    const isOpen = vi.fn((h) => h === "12:00-23:00");
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", [], "", true, (x) => x.hours, isOpen);
    expect(isOpen).toHaveBeenCalled();
    expect(result.every((x) => x.hours === "12:00-23:00")).toBe(true);
  });

  it("catFilter + searchText compose correctly", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", ["Restaurante"], "alpha", false, (x) => x.hours);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
  });

  it("handles empty data array", () => {
    expect(filterAndSort([], "São Paulo", [], "", false, (x) => x.hours)).toEqual([]);
  });

  it("treats missing rating as 0 (sorts to the end)", () => {
    const data = [
      { id: "b1", city: "SP", name: "Sin rating", hours: "" },
      { id: "b2", city: "SP", name: "Con rating", rating: "4.5", hours: "" },
    ];
    const result = filterAndSort(data, "SP", [], "", false, (x) => x.hours);
    expect(result[0].id).toBe("b2");
    expect(result[1].id).toBe("b1");
  });

  it("treats null rating as 0", () => {
    const data = [
      { id: "c1", city: "SP", name: "A", rating: null,    hours: "" },
      { id: "c2", city: "SP", name: "B", rating: "4.5",   hours: "" },
      { id: "c3", city: "SP", name: "C", rating: undefined, hours: "" },
    ];
    const result = filterAndSort(data, "SP", [], "", false, (x) => x.hours);
    expect(result[0].id).toBe("c2");
    expect(result.slice(1).map((x) => x.rating == null).every(Boolean)).toBe(true);
  });

  it("searches by area field", () => {
    const data = [
      { id: "d1", city: "SP", name: "A", area: "Liberdade", hours: "" },
      { id: "d2", city: "SP", name: "B", area: "Pinheiros", hours: "" },
    ];
    expect(filterAndSort(data, "SP", [], "liber", false, (x) => x.hours)).toHaveLength(1);
    expect(filterAndSort(data, "SP", [], "liber", false, (x) => x.hours)[0].id).toBe("d1");
  });

  it("searches by note field", () => {
    const data = [
      { id: "e1", city: "SP", name: "A", note: "Michelin estrella", hours: "" },
      { id: "e2", city: "SP", name: "B", note: "Local",             hours: "" },
    ];
    expect(filterAndSort(data, "SP", [], "michelin", false, (x) => x.hours)[0].id).toBe("e1");
  });

  it("searches by kind field", () => {
    const data = [
      { id: "f1", city: "SP", name: "A", kind: "Bares de vinos", hours: "" },
      { id: "f2", city: "SP", name: "B", kind: "Cervecería",     hours: "" },
    ];
    expect(filterAndSort(data, "SP", [], "vino", false, (x) => x.hours)[0].id).toBe("f1");
  });

  it("search is case-insensitive", () => {
    const data = [{ id: "g1", city: "SP", name: "Padaria São João", hours: "" }];
    expect(filterAndSort(data, "SP", [], "SÃO", false, (x) => x.hours)).toHaveLength(1);
    expect(filterAndSort(data, "SP", [], "são", false, (x) => x.hours)).toHaveLength(1);
    expect(filterAndSort(data, "SP", [], "SAO", false, (x) => x.hours)).toHaveLength(0); // no accent match
  });

  it("openNow=true with all items failing isOpenNowFn returns empty", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", [], "", true, (x) => x.hours, () => false);
    expect(result).toHaveLength(0);
  });

  it("openNow=true with no isOpenNowFn includes all city items (safe default)", () => {
    const cityItems = SAMPLE_DATA.filter((x) => x.city === "São Paulo");
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", [], "", true, (x) => x.hours);
    expect(result).toHaveLength(cityItems.length);
  });

  it("openNow=true + catFilter: both filters apply together", () => {
    const result = filterAndSort(
      SAMPLE_DATA, "São Paulo", ["Bar"], "", true,
      (x) => x.hours,
      (h) => h === "17:00-02:00"
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a2");
  });

  it("openNow=true: getHours returning null/undefined treated as closed", () => {
    const data = [{ id: "h1", city: "SP", name: "X", hours: undefined }];
    const result = filterAndSort(data, "SP", [], "", true, (x) => x.hours, (h) => h != null);
    expect(result).toHaveLength(0);
  });

  it("catFilter with non-existent category returns empty", () => {
    const result = filterAndSort(SAMPLE_DATA, "São Paulo", ["Heladería"], "", false, (x) => x.hours);
    expect(result).toHaveLength(0);
  });

  it("does not mutate the input array", () => {
    const data = [
      { id: "i1", city: "SP", name: "A", rating: "4.5", hours: "" },
      { id: "i2", city: "SP", name: "B", rating: "4.8", hours: "" },
    ];
    const copy = [...data];
    filterAndSort(data, "SP", [], "", false, (x) => x.hours);
    expect(data).toEqual(copy);
  });
});

// ── filterAndSort + momentToHours integration ─────────────────────────────
// Mirrors how the comidas section in main.html calls filterAndSort

describe("filterAndSort + momentToHours (comidas integration)", () => {
  const MEALS = [
    { id: "m1", city: "SP", name: "Resto A", category: "Restaurante", rating: "4.7", moment: "Cena" },
    { id: "m2", city: "SP", name: "Cafe B",  category: "Café",        rating: "4.5", moment: "Mañana" },
    { id: "m3", city: "SP", name: "Bar C",   category: "Bar",         rating: "4.6", moment: "Noche" },
  ];

  const getHours = (m) => momentToHours(m.moment) || m.hours;

  it("returns all meals for city when openNow=false", () => {
    expect(filterAndSort(MEALS, "SP", [], "", false, getHours)).toHaveLength(3);
  });

  it("openNow filters by moment-derived hours", () => {
    const isCena = (h) => h === "Todos los días 19:00-23:30";
    const result = filterAndSort(MEALS, "SP", [], "", true, getHours, isCena);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });

  it("catFilter + moment-derived hours compose", () => {
    const isEvening = (h) => ["Todos los días 19:00-23:30", "Todos los días 20:00-02:00"].includes(h);
    const result = filterAndSort(MEALS, "SP", ["Bar"], "", true, getHours, isEvening);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m3");
  });

  it("results are sorted by rating descending", () => {
    const result = filterAndSort(MEALS, "SP", [], "", false, getHours);
    expect(result.map((m) => m.id)).toEqual(["m1", "m3", "m2"]);
  });
});
