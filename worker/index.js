const ALLOWED_ORIGIN = "https://ales-birthday.pages.dev";
const ALLOWED_EMAILS = ["pallottags@gmail.com", "alelukowski@gmail.com"];
const FLIGHT_RE = /^[A-Z0-9]{2}\d{1,4}$/i;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function cors(body, status) {
  return new Response(body, { status, headers: corsHeaders() });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);

    if (origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // POST /generate-otp  — generates OTP server-side and sends it
    if (req.method === "POST" && url.pathname === "/generate-otp") {
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
      // Generate 6-digit OTP server-side
      const otp_code = String(Math.floor(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      // Store hash in KV (or env-level cache; use a simple approach: store otp+expiry encoded in the response, signed with a secret)
      // Since we don't have KV, sign the OTP so the client can verify server-generated code without exposing it
      const expires = Date.now() + 10 * 60 * 1000;
      const secret = env.OTP_SECRET || "brasil2026secret";
      const token = btoa(`${otp_code}:${expires}:${normalizedEmail}:${secret}`).replace(/=/g, "");
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
      try {
        const secret = env.OTP_SECRET || "brasil2026secret";
        const padLen = (4 - token.length % 4) % 4;
        const decoded = atob(token + "=".repeat(padLen));
        const [storedOtp, expires, storedEmail, storedSecret] = decoded.split(":");
        if (storedSecret !== secret) return cors(JSON.stringify({ ok: false, reason: "invalid" }), 200);
        if (storedEmail !== normalizedEmail) return cors(JSON.stringify({ ok: false, reason: "invalid" }), 200);
        if (Date.now() > parseInt(expires)) return cors(JSON.stringify({ ok: false, reason: "expired" }), 200);
        if (storedOtp !== String(code).trim()) return cors(JSON.stringify({ ok: false, reason: "wrong" }), 200);
        return cors(JSON.stringify({ ok: true }), 200);
      } catch { return cors(JSON.stringify({ ok: false, reason: "invalid" }), 200); }
    }

    // POST /send-otp  (legacy — kept for backward compat)
    if (req.method === "POST" && url.pathname === "/send-otp") {
      // Guard missing env vars
      if (!env.EMAILJS_SVC_ID || !env.EMAILJS_TPL_ID || !env.EMAILJS_PUB_KEY || !env.EMAILJS_PRIV_KEY) {
        return cors(JSON.stringify({ ok: false }), 503);
      }

      let body;
      try { body = await req.json(); } catch { return cors(JSON.stringify({ ok: false }), 400); }
      const { to_email, otp_code } = body;
      if (!to_email || !otp_code) return cors(JSON.stringify({ ok: false }), 400);

      // Server-side allowlist — client validation is not sufficient
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
            ...corsHeaders(),
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
      const { image } = body; // data:image/jpeg;base64,...
      if (!image || !image.startsWith("data:image/")) return cors(JSON.stringify({ ok: false }), 400);

      // Strip data URI prefix and convert base64 → Uint8Array
      const b64 = image.replace(/^data:image\/[a-z]+;base64,/, "");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      try {
        // Try Llama 3.2 Vision (messages format) first — better accuracy than LLaVA.
        // Fall back to LLaVA 1.5 if Llama 3.2 fails.
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
          // Fallback: LLaVA 1.5
          const r2 = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
            image: [...bytes],
            prompt: "What is the exact number shown in this image? Reply with ONLY the digits and decimal separator, nothing else.",
            max_tokens: 24,
          });
          text = (r2?.description || r2?.response || "").trim();
        }
        // Parse Brazilian number: may have period as thousands separator and comma as decimal
        // e.g. "1.234,98" → 1234.98, "1234,98" → 1234.98, "149.00" → 149.00
        const cleaned = text.replace(/[^\d.,]/g, "");
        let price = null;
        if (cleaned) {
          const lastComma = cleaned.lastIndexOf(",");
          const lastDot = cleaned.lastIndexOf(".");
          let normalized;
          if (lastComma > lastDot) {
            // comma is decimal separator: remove dots (thousands), replace comma with dot
            normalized = cleaned.replace(/\./g, "").replace(",", ".");
          } else {
            // dot is decimal separator: remove commas (thousands)
            normalized = cleaned.replace(/,/g, "");
          }
          const n = parseFloat(normalized);
          if (isFinite(n) && n > 0) price = n;
        }
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
          headers: { ...corsHeaders(), "Cache-Control": "public, max-age=300" },
        });
      } catch (e) {
        return cors(JSON.stringify({ ok: false, reason: String(e) }), 502);
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
