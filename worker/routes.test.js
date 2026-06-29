/**
 * Integration tests for the Cloudflare Worker HTTP routes.
 * Uses real Request/Response (Node 18+ Web API) and stubs global fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "./index.js";
import { makeToken } from "./lib.js";

const ORIGIN = "https://ales-birthday.pages.dev";
const SECRET = "test-hmac-secret-32-chars-min-ok";
const MAGIC  = "magic999";

function makeEnv(overrides = {}) {
  return {
    OTP_SECRET:       SECRET,
    MAGIC_OTP:        MAGIC,
    EMAILJS_SVC_ID:   "svc_test",
    EMAILJS_TPL_ID:   "tpl_test",
    EMAILJS_PUB_KEY:  "pub_test",
    EMAILJS_PRIV_KEY: "priv_test",
    RAPIDAPI_KEY:     "key_test",
    ...overrides,
  };
}

function makeReq(method, path, body = null, extraHeaders = {}) {
  return new Request(`https://worker.example.com${path}`, {
    method,
    headers: { Origin: ORIGIN, "Content-Type": "application/json", ...extraHeaders },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

// Helper: stub globalThis.fetch for tests that hit external APIs
function stubFetch(responseOrFn) {
  const mock = typeof responseOrFn === "function"
    ? vi.fn(responseOrFn)
    : vi.fn().mockResolvedValue(responseOrFn);
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => { vi.unstubAllGlobals(); });

// ── Origin guard ──────────────────────────────────────────────────────────────

describe("Origin guard", () => {
  it("returns 403 for unknown origin", async () => {
    const r = new Request("https://worker.example.com/generate-otp", {
      method: "POST",
      headers: { Origin: "https://evil.com", "Content-Type": "application/json" },
      body: JSON.stringify({ to_email: "pallottags@gmail.com" }),
    });
    const res = await handler.fetch(r, makeEnv());
    expect(res.status).toBe(403);
  });

  it("returns 403 with no origin header", async () => {
    const r = new Request("https://worker.example.com/generate-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_email: "pallottags@gmail.com" }),
    });
    const res = await handler.fetch(r, makeEnv());
    expect(res.status).toBe(403);
  });
});

// ── CORS preflight ────────────────────────────────────────────────────────────

describe("CORS preflight", () => {
  it("OPTIONS returns 204 with CORS headers", async () => {
    const r = new Request("https://worker.example.com/generate-otp", {
      method: "OPTIONS",
      headers: { Origin: ORIGIN },
    });
    const res = await handler.fetch(r, makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBeTruthy();
  });
});

// ── Not found ─────────────────────────────────────────────────────────────────

describe("404", () => {
  it("unknown path returns 404", async () => {
    const res = await handler.fetch(makeReq("GET", "/unknown-path"), makeEnv());
    expect(res.status).toBe(404);
  });
});

// ── POST /generate-otp ────────────────────────────────────────────────────────

describe("POST /generate-otp", () => {
  beforeEach(() => {
    stubFetch(new Response('{"ok":true}', { status: 200 }));
  });

  it("returns 200 + token when email is valid", async () => {
    const res  = await handler.fetch(makeReq("POST", "/generate-otp", { to_email: "pallottags@gmail.com" }), makeEnv());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.token).toContain(".");
  });

  it("returns 403 for unlisted email", async () => {
    const res = await handler.fetch(makeReq("POST", "/generate-otp", { to_email: "other@gmail.com" }), makeEnv());
    expect(res.status).toBe(403);
  });

  it("normalizes email to lowercase before checking allowlist", async () => {
    const res  = await handler.fetch(makeReq("POST", "/generate-otp", { to_email: "PALLOTTAGS@GMAIL.COM" }), makeEnv());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("returns 503 when OTP_SECRET is missing", async () => {
    const res = await handler.fetch(
      makeReq("POST", "/generate-otp", { to_email: "pallottags@gmail.com" }),
      makeEnv({ OTP_SECRET: undefined })
    );
    expect(res.status).toBe(503);
  });

  it("returns 503 when EmailJS env vars are missing", async () => {
    const res = await handler.fetch(
      makeReq("POST", "/generate-otp", { to_email: "pallottags@gmail.com" }),
      makeEnv({ EMAILJS_SVC_ID: undefined })
    );
    expect(res.status).toBe(503);
  });

  it("returns 400 when to_email is missing", async () => {
    const res = await handler.fetch(makeReq("POST", "/generate-otp", {}), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 502 when EmailJS API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("error", { status: 500 })));
    const res  = await handler.fetch(makeReq("POST", "/generate-otp", { to_email: "pallottags@gmail.com" }), makeEnv());
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
  });
});

// ── POST /verify-otp ──────────────────────────────────────────────────────────

describe("POST /verify-otp", () => {
  it("accepts magic OTP without a token", async () => {
    const body = { code: MAGIC, to_email: "pallottags@gmail.com" };
    const res  = await handler.fetch(makeReq("POST", "/verify-otp", body), makeEnv());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("magic OTP works for the second allowed email too", async () => {
    const body = { code: MAGIC, to_email: "alelukowski@gmail.com" };
    const res  = await handler.fetch(makeReq("POST", "/verify-otp", body), makeEnv());
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("verifies a valid HMAC token", async () => {
    const email   = "pallottags@gmail.com";
    const otp     = "987654";
    const expires = Date.now() + 10 * 60 * 1000;
    const token   = await makeToken(otp, expires, email, SECRET);
    const res     = await handler.fetch(makeReq("POST", "/verify-otp", { code: otp, to_email: email, token }), makeEnv());
    const json    = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("rejects wrong code", async () => {
    const email   = "pallottags@gmail.com";
    const otp     = "111111";
    const expires = Date.now() + 10 * 60 * 1000;
    const token   = await makeToken(otp, expires, email, SECRET);
    const res     = await handler.fetch(makeReq("POST", "/verify-otp", { code: "999999", to_email: email, token }), makeEnv());
    const json    = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("wrong");
  });

  it("rejects expired token", async () => {
    const email   = "pallottags@gmail.com";
    const otp     = "222222";
    const expires = Date.now() - 1000;
    const token   = await makeToken(otp, expires, email, SECRET);
    const res     = await handler.fetch(makeReq("POST", "/verify-otp", { code: otp, to_email: email, token }), makeEnv());
    const json    = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("expired");
  });

  it("returns 403 for unlisted email", async () => {
    const res = await handler.fetch(makeReq("POST", "/verify-otp", { code: "123456", to_email: "bad@actor.com" }), makeEnv());
    expect(res.status).toBe(403);
  });

  it("returns 400 when code is missing", async () => {
    const res = await handler.fetch(makeReq("POST", "/verify-otp", { to_email: "pallottags@gmail.com" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("magic OTP is inactive when MAGIC_OTP env is unset", async () => {
    const body = { code: MAGIC, to_email: "pallottags@gmail.com" };
    const res  = await handler.fetch(makeReq("POST", "/verify-otp", body), makeEnv({ MAGIC_OTP: undefined }));
    const json = await res.json();
    // No token provided and magic disabled → should fail
    expect(json.ok).toBe(false);
  });
});

// ── GET /flight/:number/:date ─────────────────────────────────────────────────

describe("GET /flight/:number/:date", () => {
  beforeEach(() => {
    stubFetch(new Response(
      JSON.stringify([{ number: "G31179", status: "Scheduled" }]),
      { status: 200 }
    ));
  });

  it("returns 200 and Cache-Control for valid params", async () => {
    const res = await handler.fetch(makeReq("GET", "/flight/G31179/2026-07-09"), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });

  it("returns 400 for invalid flight number (too long / special chars)", async () => {
    const res = await handler.fetch(makeReq("GET", "/flight/TOOLONG1/2026-07-09"), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 for path-traversal-like flight number", async () => {
    const res = await handler.fetch(makeReq("GET", "/flight/..%2Fetc/2026-07-09"), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const res = await handler.fetch(makeReq("GET", "/flight/G31179/09-07-2026"), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 for impossible month (13)", async () => {
    const res = await handler.fetch(makeReq("GET", "/flight/G31179/2026-13-01"), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing date segment", async () => {
    const res = await handler.fetch(makeReq("GET", "/flight/G31179"), makeEnv());
    expect(res.status).toBe(400);
  });

  it("passes upstream error status through on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Not found" }), { status: 404 })
    ));
    const res = await handler.fetch(makeReq("GET", "/flight/G31179/2026-07-09"), makeEnv());
    expect(res.status).toBe(404);
  });
});

// ── GET /brl-rate ─────────────────────────────────────────────────────────────

describe("GET /brl-rate", () => {
  it("returns ARS + USD rates on success", async () => {
    // Real-world BRLARS is ~200+ ARS per BRL; worker sanity-checks ars >= 10
    stubFetch(new Response(JSON.stringify({
      cocos: { quotes: [
        { symbol: "BRLARS", buy: 215.50 },
        { symbol: "BRLUSD", buy: 0.17  },
      ]},
    }), { status: 200 }));

    const res  = await handler.fetch(makeReq("GET", "/brl-rate"), makeEnv());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ars).toBe(215.50);
    expect(body.usd).toBe(0.17);
  });

  it("returns 502 on upstream HTTP error", async () => {
    stubFetch(new Response("error", { status: 500 }));
    const res = await handler.fetch(makeReq("GET", "/brl-rate"), makeEnv());
    expect(res.status).toBe(502);
  });

  it("returns 502 when cocos quotes are missing from response", async () => {
    stubFetch(new Response(JSON.stringify({ other: {} }), { status: 200 }));
    const res = await handler.fetch(makeReq("GET", "/brl-rate"), makeEnv());
    expect(res.status).toBe(502);
  });

  it("returns 502 when BRLARS rate is suspiciously low (< 10)", async () => {
    // Sanity guard: ars < 10 is treated as invalid data
    stubFetch(new Response(JSON.stringify({
      cocos: { quotes: [{ symbol: "BRLARS", buy: 0.001 }] },
    }), { status: 200 }));
    const res = await handler.fetch(makeReq("GET", "/brl-rate"), makeEnv());
    expect(res.status).toBe(502);
  });

  it("returns Cache-Control header on success", async () => {
    stubFetch(new Response(JSON.stringify({
      cocos: { quotes: [{ symbol: "BRLARS", buy: 215.50 }] },
    }), { status: 200 }));
    const res = await handler.fetch(makeReq("GET", "/brl-rate"), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe("Rate limiting on /verify-otp", () => {
  it("blocks on the 11th attempt from the same IP", async () => {
    // Use a fresh env without magic OTP so each attempt counts
    const env = makeEnv({ MAGIC_OTP: undefined });
    const ip  = "9.9.9.99";

    for (let i = 0; i < 10; i++) {
      await handler.fetch(
        new Request("https://worker.example.com/verify-otp", {
          method: "POST",
          headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": ip },
          body: JSON.stringify({ code: "000000", to_email: "pallottags@gmail.com" }),
        }),
        env
      );
    }

    const res = await handler.fetch(
      new Request("https://worker.example.com/verify-otp", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": ip },
        body: JSON.stringify({ code: "000000", to_email: "pallottags@gmail.com" }),
      }),
      env
    );
    expect(res.status).toBe(429);
  });
});
