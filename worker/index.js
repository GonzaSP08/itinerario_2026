import { ALLOWED_EMAILS, parseBrazilianNumber } from "./lib.js";

// Production origin + any Cloudflare Pages preview deploy of the same project.
// The email allowlist (ALLOWED_EMAILS) is the real auth gate, so previews are safe to allow.
const PAGES_ORIGIN_RE = /^https:\/\/(?:[a-z0-9-]+\.)?ales-birthday\.pages\.dev$/;
function isAllowedOrigin(o) { return PAGES_ORIGIN_RE.test(o); }

const FLIGHT_RE = /^[A-Z0-9]{2}\d{1,4}$/i;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Rate limiter for /verify-otp.
// Uses KV (global across all Worker instances) when RATE_LIMIT_KV is bound;
// falls back to in-memory Map (per-instance) if the binding is absent.
// To enable global limiting: create a KV namespace and add to wrangler.toml:
//   [[kv_namespaces]]
//   binding = "RATE_LIMIT_KV"
//   id = "<your-namespace-id>"
const otpAttempts = new Map();
const OTP_MAX_ATTEMPTS = 10;
const OTP_WINDOW_MS = 15 * 60 * 1000;

function getRateKey(req) {
  return req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "unknown";
}

async function checkRateLimit(key, kvStore) {
  const now = Date.now();
  if (kvStore) {
    const kvKey = `otp:${key}`;
    const raw = await kvStore.get(kvKey);
    const entry = raw ? JSON.parse(raw) : null;
    if (!entry || now > entry.resetAt) {
      await kvStore.put(kvKey, JSON.stringify({ count: 1, resetAt: now + OTP_WINDOW_MS }), { expirationTtl: Math.ceil(OTP_WINDOW_MS / 1000) });
      return false;
    }
    entry.count++;
    if (entry.count > OTP_MAX_ATTEMPTS) return true;
    await kvStore.put(kvKey, JSON.stringify(entry), { expirationTtl: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) });
    return false;
  }
  // In-memory fallback
  const entry = otpAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    otpAttempts.set(key, { count: 1, resetAt: now + OTP_WINDOW_MS });
    return false;
  }
  entry.count++;
  if (entry.count > OTP_MAX_ATTEMPTS) return true;
  return false;
}

function corsHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}


// HMAC-SHA256 token helpers (replaces base64 encoding)
async function signToken(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function makeToken(otp, expires, email, secret) {
  const payload = `${otp}:${expires}:${email}`;
  const sig = await signToken(payload, secret);
  return btoa(payload).replace(/=/g, "") + "." + sig;
}

async function verifyToken(token, code, email, secret) {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return { ok: false, reason: "invalid" };
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const padLen = (4 - payloadB64.length % 4) % 4;
  let payload;
  try { payload = atob(payloadB64 + "=".repeat(padLen)); } catch { return { ok: false, reason: "invalid" }; }
  const expected = await signToken(payload, secret);
  if (expected !== sig) return { ok: false, reason: "invalid" };
  const [storedOtp, expires, storedEmail] = payload.split(":");
  if (storedEmail !== email) return { ok: false, reason: "invalid" };
  if (Date.now() > parseInt(expires)) return { ok: false, reason: "expired" };
  if (storedOtp !== String(code).trim()) return { ok: false, reason: "wrong" };
  return { ok: true };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);
    const cors = (body, status) => new Response(body, { status, headers: corsHeaders(origin) });

    if (!isAllowedOrigin(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // POST /generate-otp  — generates OTP server-side and sends it
    if (req.method === "POST" && url.pathname === "/generate-otp") {
      if (!env.OTP_SECRET) return cors(JSON.stringify({ ok: false }), 503);
      if (!env.EMAILJS_SVC_ID || !env.EMAILJS_TPL_ID || !env.EMAILJS_PUB_KEY || !env.EMAILJS_PRIV_KEY) {
        return cors(JSON.stringify({ ok: false }), 503);
      }
      let body;
      try { body = await req.json(); } catch { return cors(JSON.stringify({ ok: false }), 400); }
      const { to_email } = body;
      if (!to_email) return cors(JSON.stringify({ ok: false }), 400);
      const normalizedEmail = String(to_email).trim().toLowerCase();
      if (!ALLOWED_EMAILS.includes(normalizedEmail)) return cors(JSON.stringify({ ok: false }), 403);
      if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(normalizedEmail)) return cors(JSON.stringify({ ok: false }), 400);
      const otp_code = String(Math.floor(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      const expires = Date.now() + 10 * 60 * 1000;
      const token = await makeToken(otp_code, expires, normalizedEmail, env.OTP_SECRET);
      try {
        const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_id: env.EMAILJS_SVC_ID, template_id: env.EMAILJS_TPL_ID, user_id: env.EMAILJS_PUB_KEY, accessToken: env.EMAILJS_PRIV_KEY,
            template_params: { to_email: normalizedEmail, otp_code, app_name: "Itinerario Brasil 2026" },
          }),
        });
        return cors(JSON.stringify({ ok: res.ok, token: res.ok ? token : null }), res.ok ? 200 : 502);
      } catch { return cors(JSON.stringify({ ok: false }), 502); }
    }

    // POST /verify-otp
    if (req.method === "POST" && url.pathname === "/verify-otp") {
      const rateKey = getRateKey(req);
      if (await checkRateLimit(rateKey, env.RATE_LIMIT_KV)) return cors(JSON.stringify({ ok: false, reason: "rate_limited" }), 429);
      if (!env.OTP_SECRET) return cors(JSON.stringify({ ok: false }), 503);
      let body;
      try { body = await req.json(); } catch { return cors(JSON.stringify({ ok: false }), 400); }
      const { token, code, to_email } = body;
      if (!code || !to_email) return cors(JSON.stringify({ ok: false }), 400);
      const normalizedEmail = String(to_email).trim().toLowerCase();
      if (!ALLOWED_EMAILS.includes(normalizedEmail)) return cors(JSON.stringify({ ok: false }), 403);
      // Magic OTP — bypasses token requirement (used when email delivery fails)
      if (env.MAGIC_OTP && String(code).trim() === String(env.MAGIC_OTP).trim()) {
        return cors(JSON.stringify({ ok: true }), 200);
      }
      if (!token) return cors(JSON.stringify({ ok: false, reason: "invalid" }), 200);
      const result = await verifyToken(token, code, normalizedEmail, env.OTP_SECRET);
      return cors(JSON.stringify(result), 200);
    }

    // POST /send-otp  (legacy — kept for backward compat)
    if (req.method === "POST" && url.pathname === "/send-otp") {
      if (!env.EMAILJS_SVC_ID || !env.EMAILJS_TPL_ID || !env.EMAILJS_PUB_KEY || !env.EMAILJS_PRIV_KEY) {
        return cors(JSON.stringify({ ok: false }), 503);
      }

      let body;
      try { body = await req.json(); } catch { return cors(JSON.stringify({ ok: false }), 400); }
      const { to_email, otp_code } = body;
      if (!to_email || !otp_code) return cors(JSON.stringify({ ok: false }), 400);

      const normalizedEmail = String(to_email).trim().toLowerCase();
      if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
        return cors(JSON.stringify({ ok: false }), 403);
      }
      if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(normalizedEmail)) {
        return cors(JSON.stringify({ ok: false }), 400);
      }

      try {
        const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_id: env.EMAILJS_SVC_ID,
            template_id: env.EMAILJS_TPL_ID,
            user_id: env.EMAILJS_PUB_KEY,
            accessToken: env.EMAILJS_PRIV_KEY,
            template_params: { to_email: normalizedEmail, otp_code, app_name: "Itinerario Brasil 2026" },
          }),
        });
        return cors(JSON.stringify({ ok: res.ok }), res.ok ? 200 : 502);
      } catch {
        return cors(JSON.stringify({ ok: false }), 502);
      }
    }

    // GET /flight/:number/:date
    if (req.method === "GET" && url.pathname.startsWith("/flight/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const flightNum = parts[1];
      const date = parts[2];
      if (!flightNum || !date) return cors(JSON.stringify({ error: "Missing params" }), 400);
      if (!FLIGHT_RE.test(flightNum) || !DATE_RE.test(date)) {
        return cors(JSON.stringify({ error: "Invalid params" }), 400);
      }

      try {
        const res = await fetch(
          `https://aerodatabox.p.rapidapi.com/flights/Number/${flightNum}/${date}`,
          { headers: { "x-rapidapi-host": "aerodatabox.p.rapidapi.com", "x-rapidapi-key": env.RAPIDAPI_KEY } }
        );
        const data = await res.text();
        return new Response(data, {
          status: res.status,
          headers: {
            ...corsHeaders(origin),
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300",
          },
        });
      } catch {
        return cors(JSON.stringify({ error: "Upstream error" }), 502);
      }
    }

    // POST /ocr-price  — extracts a BRL price from a JPEG frame using Workers AI
    if (req.method === "POST" && url.pathname === "/ocr-price") {
      if (!env.AI) return cors(JSON.stringify({ ok: false, reason: "ai_unavailable" }), 503);
      let body;
      try { body = await req.json(); } catch { return cors(JSON.stringify({ ok: false }), 400); }
      const { image } = body;
      if (!image || !image.startsWith("data:image/")) return cors(JSON.stringify({ ok: false }), 400);

      const b64 = image.replace(/^data:image\/[a-z]+;base64,/, "");

      try {
        let text = "";
        try {
          const r = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
                  { type: "text", text: "What number is shown in this image? Copy it exactly, digit by digit. Reply with ONLY the digits and the decimal/thousands separators. No words, no R$, just the number." }
                ]
              }
            ],
            max_tokens: 32,
          });
          text = (r?.response || r?.description || "").trim();
        } catch (_) {
          // Fallback: LLaVA 1.5 — convert base64 to bytes only when needed
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const r2 = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
            image: [...bytes],
            prompt: "What is the exact number shown in this image? Reply with ONLY the digits and decimal separator, nothing else.",
            max_tokens: 24,
          });
          text = (r2?.description || r2?.response || "").trim();
        }
        const price = parseBrazilianNumber(text);
        return cors(JSON.stringify({ ok: true, price, raw: text }), 200);
      } catch (e) {
        return cors(JSON.stringify({ ok: false, reason: String(e) }), 500);
      }
    }

    // GET /brl-rate — Cocos ARS/BRL rate from api.comparapix.ar
    if (req.method === "GET" && url.pathname === "/brl-rate") {
      try {
        const res = await fetch("https://api.comparapix.ar/quotes");
        if (!res.ok) throw new Error("upstream");
        const data = await res.json();
        const cocosQuotes = data?.cocos?.quotes;
        if (!cocosQuotes) throw new Error("no_cocos");
        const brlArs = cocosQuotes.find((q) => q.symbol === "BRLARS");
        const brlUsd = cocosQuotes.find((q) => q.symbol === "BRLUSD");
        const ars = brlArs?.buy;
        const usd = brlUsd?.buy;
        if (!ars || !isFinite(ars) || ars < 10) throw new Error("invalid");
        return new Response(JSON.stringify({ ok: true, ars, usd: usd || null }), {
          status: 200,
          headers: { ...corsHeaders(origin), "Cache-Control": "public, max-age=300" },
        });
      } catch (e) {
        return cors(JSON.stringify({ ok: false, reason: String(e) }), 502);
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
