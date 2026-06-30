// Pure functions mirrored from main.html — keep in sync manually.
// Only functions with zero DOM/React dependencies belong here.

// ── HTML escape ─────────────────────────────────────────────────────────────
export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ── URL normalisation ────────────────────────────────────────────────────────
export function normalizeUrl(url) {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : "https://" + url;
}

// ── ISO time extraction ──────────────────────────────────────────────────────
export function localTime(isoStr) {
  if (!isoStr) return null;
  const match = isoStr.match(/(\d{2}:\d{2})[-+]/);
  return match ? match[1] : null;
}

// ── Theme helper ─────────────────────────────────────────────────────────────
// T = { baseRGB: "r,g,b", dark: bool }
export const fade = (T, a) =>
  `rgba(${T.baseRGB},${T.dark && a >= 0.3 && a < 0.52 ? 0.52 : a})`;

// ── Accent colour for dark mode ──────────────────────────────────────────────
export const accentForDark = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = (c) => Math.round(c * 0.4 + 153).toString(16).padStart(2, "0");
  return "#" + f(r) + f(g) + f(b);
};

// ── Search matching ──────────────────────────────────────────────────────────
export function matchesSearch(item, text, q = text.toLowerCase()) {
  if (!q.trim()) return true;
  return (
    (item.name || "").toLowerCase().includes(q) ||
    (item.note || "").toLowerCase().includes(q) ||
    (item.kind || "").toLowerCase().includes(q) ||
    (item.area || "").toLowerCase().includes(q)
  );
}

// ── WMO weather code → label/type ───────────────────────────────────────────
export function wmoInfo(code) {
  if (code === 0)  return { label: "Despejado",             type: "sun"     };
  if (code <= 2)   return { label: "Parcialmente nublado",  type: "partly"  };
  if (code === 3)  return { label: "Nublado",               type: "cloud"   };
  if (code <= 48)  return { label: "Niebla",                type: "fog"     };
  if (code <= 55)  return { label: "Llovizna",              type: "drizzle" };
  if (code <= 67)  return { label: "Lluvia",                type: "rain"    };
  if (code <= 82)  return { label: "Chubascos",             type: "rain"    };
  if (code <= 99)  return { label: "Tormenta",              type: "storm"   };
  return { label: "Variable", type: "partly" };
}

// ── Date formatting ──────────────────────────────────────────────────────────
const DIAS_ES  = ["Dom","Lun","Mar","Mi\xE9","Jue","Vie","S\xE1b"];
const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

export function fmtDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { dow: DIAS_ES[dt.getDay()], d, mon: MESES_ES[m - 1] };
}

// ── Moment label → hours string ──────────────────────────────────────────────
export function momentToHours(mom) {
  return {
    "Ma\xF1ana":   "Todos los d\xEDas 07:00-12:00",
    "Almuerzo": "Todos los d\xEDas 12:00-15:30",
    "Brunch":   "Todos los d\xEDas 09:00-16:00",
    "Tarde":    "Todos los d\xEDas 15:00-20:00",
    "Cena":     "Todos los d\xEDas 19:00-23:30",
    "Noche":    "Todos los d\xEDas 20:00-02:00",
  }[mom] || null;
}

// ── BRL price extraction from OCR text ──────────────────────────────────────
export function parseBRLNum(s) {
  const n = parseFloat(
    String(s).replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".")
  );
  return isFinite(n) && n > 0 ? n : null;
}

export function extractPrices(text) {
  const found = new Set();
  for (const m of text.matchAll(/R\$\s*([\d.,]+)/gi)) {
    const n = parseBRLNum(m[1]);
    if (n) found.add(n);
  }
  for (const m of text.matchAll(/\b\d{1,3}(?:\.\d{3})+,\d{2}\b/g)) {
    const n = parseBRLNum(m[0]);
    if (n) found.add(n);
  }
  for (const m of text.matchAll(/\b\d{1,5},\d{2}\b/g)) {
    const n = parseBRLNum(m[0]);
    if (n && n <= 99999) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

// ── OCR-output BRL parser (separator-agnostic) ───────────────────────────────
export function _parseBRL(s) {
  s = (s || "").replace(/[^0-9.,]/g, "");
  if (!s) return null;
  const seps = [...s.matchAll(/[.,]/g)];
  if (!seps.length) {
    const n = parseFloat(s);
    return isFinite(n) && n > 0 ? n : null;
  }
  const lastSep = seps[seps.length - 1];
  const after   = s.slice(lastSep.index + 1);
  let norm;
  if (after.length === 2) {
    norm = s.slice(0, lastSep.index).replace(/[.,]/g, "") + "." + after;
  } else {
    norm = s.replace(/[.,]/g, "");
  }
  const n = parseFloat(norm);
  return isFinite(n) && n > 0 ? n : null;
}

// ── Cosine similarity ────────────────────────────────────────────────────────
export function _cosSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ── filterAndSort — city-grouped list filtering ──────────────────────────
// isOpenNowFn is injected so callers can mock it in tests.
// In main.html the global isOpenNow is used directly as a closure.
// Default () => true: omitting isOpenNowFn with openNow=true includes everything.
export function filterAndSort(data, city, catFilter, searchText, openNow, getHours, isOpenNowFn = () => true) {
  const q = searchText ? searchText.toLowerCase() : "";
  return data
    .filter((x) => {
      if (x.city !== city) return false;
      if (catFilter.length && !catFilter.includes(x.category)) return false;
      if (q.trim() && !matchesSearch(x, searchText, q)) return false;
      if (openNow && !isOpenNowFn(getHours(x))) return false;
      return true;
    })
    .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
}
// ── Days until a "dd.mm.yyyy" date ──────────────────────────────────────────
export function getDaysUntil(dateStr, fromDate = new Date()) {
  const [day, month, year] = dateStr.split(".");
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  target.setHours(0, 0, 0, 0);
  const today = new Date(fromDate);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1e3 * 60 * 60 * 24));
}
