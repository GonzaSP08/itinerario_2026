import { describe, it, expect, beforeEach } from "vitest";
import {
  signToken, makeToken, verifyToken,
  makeRateLimiter,
  parseBrazilianNumber,
  ALLOWED_EMAILS, FLIGHT_RE, DATE_RE,
  OTP_MAX_ATTEMPTS,
} from "./lib.js";

const SECRET = "test-secret-32-chars-minimum-ok!";
const EMAIL = "pallottags@gmail.com";
const OTP = "123456";

// ── Token: makeToken / verifyToken ──────────────────────────────────────

describe("makeToken + verifyToken", () => {
  it("valid token verifies OK", async () => {
    const expires = Date.now() + 10 * 60 * 1000;
    const token = await makeToken(OTP, expires, EMAIL, SECRET);
    const result = await verifyToken(token, OTP, EMAIL, SECRET);
    expect(result).toEqual({ ok: true });
  });

  it("wrong code returns wrong", async () => {
    const expires = Date.now() + 10 * 60 * 1000;
    const token = await makeToken(OTP, expires, EMAIL, SECRET);
    const result = await verifyToken(token, "999999", EMAIL, SECRET);
    expect(result).toEqual({ ok: false, reason: "wrong" });
  });

  it("expired token returns expired", async () => {
    const expires = Date.now() - 1000; // already in the past
    const token = await makeToken(OTP, expires, EMAIL, SECRET);
    const result = await verifyToken(token, OTP, EMAIL, SECRET);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("wrong email returns invalid", async () => {
    const expires = Date.now() + 10 * 60 * 1000;
    const token = await makeToken(OTP, expires, EMAIL, SECRET);
    const result = await verifyToken(token, OTP, "other@gmail.com", SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("tampered payload returns invalid", async () => {
    const expires = Date.now() + 10 * 60 * 1000;
    const token = await makeToken(OTP, expires, EMAIL, SECRET);
    const dot = token.lastIndexOf(".");
    const tampered = btoa("999999:" + expires + ":" + EMAIL).replace(/=/g, "") + token.slice(dot);
    const result = await verifyToken(tampered, "999999", EMAIL, SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("wrong secret returns invalid", async () => {
    const expires = Date.now() + 10 * 60 * 1000;
    const token = await makeToken(OTP, expires, EMAIL, SECRET);
    const result = await verifyToken(token, OTP, EMAIL, "different-secret!!");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("malformed token (no dot) returns invalid", async () => {
    const result = await verifyToken("thisisnotavalidtoken", OTP, EMAIL, SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("empty token returns invalid", async () => {
    const result = await verifyToken("", OTP, EMAIL, SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("token with leading/trailing whitespace in code still verifies", async () => {
    const expires = Date.now() + 10 * 60 * 1000;
    const token = await makeToken(OTP, expires, EMAIL, SECRET);
    const result = await verifyToken(token, "  123456  ", EMAIL, SECRET);
    expect(result).toEqual({ ok: true });
  });

  it("two different secrets produce different tokens", async () => {
    const expires = Date.now() + 10 * 60 * 1000;
    const t1 = await makeToken(OTP, expires, EMAIL, SECRET);
    const t2 = await makeToken(OTP, expires, EMAIL, "other-secret-entirely!!");
    expect(t1).not.toBe(t2);
  });
});

// ── signToken determinism ────────────────────────────────────────────────

describe("signToken", () => {
  it("same inputs produce same signature", async () => {
    const s1 = await signToken("hello", SECRET);
    const s2 = await signToken("hello", SECRET);
    expect(s1).toBe(s2);
  });

  it("different data produces different signature", async () => {
    const s1 = await signToken("hello", SECRET);
    const s2 = await signToken("world", SECRET);
    expect(s1).not.toBe(s2);
  });

  it("output is URL-safe base64 (no +, /, =)", async () => {
    const sig = await signToken("test data", SECRET);
    expect(sig).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});

// ── Rate limiter ─────────────────────────────────────────────────────────

describe("makeRateLimiter", () => {
  let rl;
  beforeEach(() => { rl = makeRateLimiter(); });

  it("first request is allowed", () => {
    expect(rl.check("1.2.3.4")).toBe(false);
  });

  it(`allows up to ${OTP_MAX_ATTEMPTS} attempts`, () => {
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(rl.check("1.2.3.4")).toBe(false);
    }
  });

  it(`blocks on attempt ${OTP_MAX_ATTEMPTS + 1}`, () => {
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) rl.check("1.2.3.4");
    expect(rl.check("1.2.3.4")).toBe(true);
  });

  it("different IPs are tracked independently", () => {
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) rl.check("1.1.1.1");
    rl.check("1.1.1.1"); // blocked
    expect(rl.check("2.2.2.2")).toBe(false); // different IP, clean
  });

  it("counter resets after window expires", () => {
    const now = Date.now();
    for (let i = 0; i <= OTP_MAX_ATTEMPTS; i++) rl.check("1.2.3.4", now);
    // simulate time past the window
    const future = now + 16 * 60 * 1000;
    expect(rl.check("1.2.3.4", future)).toBe(false);
  });
});

// ── Input validation ─────────────────────────────────────────────────────

describe("ALLOWED_EMAILS", () => {
  it("includes the owner emails", () => {
    expect(ALLOWED_EMAILS).toContain("pallottags@gmail.com");
    expect(ALLOWED_EMAILS).toContain("alelukowski@gmail.com");
  });

  it("rejects unknown email", () => {
    expect(ALLOWED_EMAILS.includes("attacker@evil.com")).toBe(false);
  });
});

describe("FLIGHT_RE", () => {
  // prefix is [A-Z0-9]{2} so alphanumeric prefixes like A1 are valid
  it.each(["AR1234", "LA800", "G3123", "AA1", "IB3456", "A1234"])("accepts valid flight %s", (f) => {
    expect(FLIGHT_RE.test(f)).toBe(true);
  });

  it.each(["", "TOOLONG1", "AR-123", "AR 123", "../etc"])("rejects invalid %s", (f) => {
    expect(FLIGHT_RE.test(f)).toBe(false);
  });
});

describe("DATE_RE", () => {
  it.each(["2026-07-15", "2025-01-01", "2026-12-31"])("accepts valid date %s", (d) => {
    expect(DATE_RE.test(d)).toBe(true);
  });

  it.each(["2026-13-01", "2026-00-01", "2026-07-00", "2026-7-15", "26-07-15", "2026/07/15"])("rejects invalid %s", (d) => {
    expect(DATE_RE.test(d)).toBe(false);
  });
});

// ── BRL number parser ────────────────────────────────────────────────────

describe("parseBrazilianNumber", () => {
  it.each([
    ["149,00", 149],
    ["R$ 149,00", 149],
    ["1.234,98", 1234.98],
    ["1234,98", 1234.98],
    ["149.00", 149],
    ["1,234.00", 1234],
    ["99", 99],
  ])("parses '%s' → %d", (input, expected) => {
    expect(parseBrazilianNumber(input)).toBeCloseTo(expected, 1);
  });

  it.each(["", "abc", "R$", ","])("returns null for non-numeric '%s'", (input) => {
    expect(parseBrazilianNumber(input)).toBeNull();
  });

  it("returns null for zero", () => {
    expect(parseBrazilianNumber("0,00")).toBeNull();
  });

  it("returns null for negative-like input (no digits after strip)", () => {
    expect(parseBrazilianNumber("-")).toBeNull();
  });
});
