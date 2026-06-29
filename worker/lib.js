// Pure functions extracted from index.js — testable without Cloudflare runtime

export const ALLOWED_EMAILS = ["pallottags@gmail.com", "alelukowski@gmail.com"];
export const FLIGHT_RE = /^[A-Z0-9]{2}\d{1,4}$/i;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const OTP_MAX_ATTEMPTS = 10;
export const OTP_WINDOW_MS = 15 * 60 * 1000;

export async function signToken(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function makeToken(otp, expires, email, secret) {
  const payload = `${otp}:${expires}:${email}`;
  const sig = await signToken(payload, secret);
  return btoa(payload).replace(/=/g, "") + "." + sig;
}

export async function verifyToken(token, code, email, secret) {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return { ok: false, reason: "invalid" };
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const padLen = (4 - payloadB64.length % 4) % 4;
  let payload;
  try { payload = atob(payloadB64 + "=".repeat(padLen)); }
  catch { return { ok: false, reason: "invalid" }; }
  const expected = await signToken(payload, secret);
  if (expected !== sig) return { ok: false, reason: "invalid" };
  const [storedOtp, expires, storedEmail] = payload.split(":");
  if (storedEmail !== email) return { ok: false, reason: "invalid" };
  if (Date.now() > parseInt(expires)) return { ok: false, reason: "expired" };
  if (storedOtp !== String(code).trim()) return { ok: false, reason: "wrong" };
  return { ok: true };
}

export function makeRateLimiter() {
  const map = new Map();
  return {
    check(key, now = Date.now()) {
      const entry = map.get(key);
      if (!entry || now > entry.resetAt) {
        map.set(key, { count: 1, resetAt: now + OTP_WINDOW_MS });
        return false;
      }
      entry.count++;
      return entry.count > OTP_MAX_ATTEMPTS;
    },
    clear() { map.clear(); },
  };
}

// BRL price extractor — mirrors the logic in extractPrices() in main.html
export function parseBrazilianNumber(text) {
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return isFinite(n) && n > 0 ? n : null;
}
