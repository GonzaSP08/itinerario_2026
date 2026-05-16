const ALLOWED_ORIGIN = "https://ales-birthday.pages.dev";
const FLIGHT_RE = /^[A-Z0-9]{2,8}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function corsHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function cors(body, status, origin) {
  return new Response(body, { status, headers: corsHeaders(origin) });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);

    if (origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // POST /send-otp
    if (req.method === "POST" && url.pathname === "/send-otp") {
      let body;
      try { body = await req.json(); } catch { return cors(JSON.stringify({ ok: false }), 400, origin); }
      const { to_email, otp_code } = body;
      if (!to_email || !otp_code) return cors(JSON.stringify({ ok: false }), 400, origin);

      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: env.EMAILJS_SVC_ID,
          template_id: env.EMAILJS_TPL_ID,
          user_id: env.EMAILJS_PUB_KEY,
          template_params: { to_email, otp_code, app_name: "Itinerario Brasil 2026" },
        }),
      });

      return cors(JSON.stringify({ ok: res.ok }), res.ok ? 200 : 502, origin);
    }

    // GET /flight/:number/:date
    if (req.method === "GET" && url.pathname.startsWith("/flight/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const flightNum = parts[1];
      const date = parts[2];
      if (!flightNum || !date) return cors(JSON.stringify({ error: "Missing params" }), 400, origin);
      if (!FLIGHT_RE.test(flightNum) || !DATE_RE.test(date)) {
        return cors(JSON.stringify({ error: "Invalid params" }), 400, origin);
      }

      const res = await fetch(
        `https://aerodatabox.p.rapidapi.com/flights/Number/${flightNum}/${date}`,
        { headers: { "x-rapidapi-host": "aerodatabox.p.rapidapi.com", "x-rapidapi-key": env.RAPIDAPI_KEY } }
      );

      const data = await res.text();
      return new Response(data, {
        status: res.status,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": res.headers.get("Content-Type") || "application/json",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
