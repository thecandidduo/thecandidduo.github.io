// Client for the worker's /stats route (the traffic counter behind the Dashboard).
// Never throws: it returns { state, ... } so the dashboard can show the right
// "here's what to do next" message for each situation instead of a raw error.
//   ok                  { data }  — the numbers
//   needs_worker_update           — the deployed worker predates the counter (its 404 has no CORS
//                                   headers, so the browser reports it as a failed request; see the probe below)
//   needs_database                — worker updated, but no D1 database bound as DB yet (501)
//   missing_secret                — worker is missing its GITHUB_REPO secret (500)
//   unauthorized                  — this CMS login isn't allowed to read stats (401/403)
//   offline / error               — couldn't reach the worker / something unexpected

import { AUTH_BASE_URL } from "./config.js";

export async function fetchStats(token, days) {
  let res;
  try {
    res = await fetch(`${AUTH_BASE_URL}/stats?days=${days}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    // The browser hides WHY a cross-origin request failed. A worker that predates the counter has
    // no /stats route, so its 404 carries no CORS headers and looks exactly like being offline.
    // Tell them apart by asking the worker's health page (a no-cors request only needs the worker
    // to answer at all): reachable -> it just needs updating; unreachable -> genuinely offline.
    try {
      await fetch(`${AUTH_BASE_URL}/`, { mode: "no-cors", cache: "no-store" });
      return { state: "needs_worker_update" };
    } catch {
      return { state: "offline" };
    }
  }
  if (res.status === 404) return { state: "needs_worker_update" };
  const body = await res.json().catch(() => null);
  if (res.status === 501) return { state: "needs_database" };
  if (res.status === 401 || res.status === 403) return { state: "unauthorized" };
  if (res.status === 500 && body && body.error === "missing_secret") return { state: "missing_secret", message: body.message };
  if (!res.ok || !body || !body.ok) return { state: "error", message: (body && body.message) || `The worker answered ${res.status}.` };
  return { state: "ok", data: body };
}
