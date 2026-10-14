const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/search";

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
  if (origin && (allowed.includes(origin) || allowed.includes("*"))) {
    headers["Access-Control-Allow-Origin"] = allowed.includes("*") ? "*" : origin;
  }
  return headers;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      if (origin && !cors["Access-Control-Allow-Origin"]) return new Response("Origin not allowed", { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);
    if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "This website origin is not allowed. Configure ALLOWED_ORIGINS in Worker settings." }, 403, cors);
    if (url.pathname !== "/api/search") return json({ error: "Not found" }, 404, cors);
    if (!env.YOUTUBE_API_KEY) return json({ error: "Worker secret YOUTUBE_API_KEY is not configured." }, 500, cors);

    const q = (url.searchParams.get("q") || "").trim().slice(0, 150);
    const view = url.searchParams.get("view") === "videos" ? "videos" : "songs";
    if (!q) return json({ error: "Search query is required." }, 400, cors);

    const yt = new URL(YOUTUBE_API);
    yt.searchParams.set("part", "snippet");
    yt.searchParams.set("type", "video");
    yt.searchParams.set("maxResults", "24");
    yt.searchParams.set("safeSearch", "none");
    yt.searchParams.set("q", q);
    if (view === "songs") yt.searchParams.set("videoCategoryId", "10");
    yt.searchParams.set("key", env.YOUTUBE_API_KEY);

    try {
      const response = await fetch(yt.toString(), { headers: { "Accept": "application/json" } });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || "YouTube search request failed.";
        return json({ error: message }, response.status === 403 ? 502 : response.status, cors);
      }
      return json({ items: data.items || [] }, 200, { ...cors, "Cache-Control": "public, max-age=60" });
    } catch {
      return json({ error: "Could not reach YouTube. Please try again." }, 502, cors);
    }
  },
};
