const ALLOWED_ORIGIN = "https://ales-birthday.pages.dev";

function cors(body, status, origin) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : "",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return cors(null, 204, origin);
    if (origin !== ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403 });

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

      const res = await fetch(
        `https://aerodatabox.p.rapidapi.com/flights/Number/${flightNum}/${date}`,
        { headers: { "x-rapidapi-host": "aerodatabox.p.rapidapi.com", "x-rapidapi-key": env.RAPIDAPI_KEY } }
      );

      const data = await res.text();
      return cors(data, res.status, origin);
    }

    return new Response("Not found", { status: 404 });
  },
};
