// Client for the worker's /latest-youtube and /tiktok-oembed endpoints (see
// oauth-worker/worker.js). Both are plain public data lookups — no API key,
// no auth needed on these two routes — just a server-side fetch the browser
// can't make itself due to CORS.

import { AUTH_BASE_URL } from "./config.js";

// Pulls the 11-character video ID out of any common way of writing a YouTube
// link (watch?v=, youtu.be/, /shorts/, /live/, /embed/, m./music. hosts,
// youtube-nocookie.com) or accepts a bare ID. Returns "" when it isn't one.
// Purely local — no network. The strict character set also guarantees the
// result is safe to place inside the quoted id="…" of a Liquid include tag.
export function parseYoutubeId(input) {
  const s = String(input || "").trim();
  const isId = (v) => /^[\w-]{11}$/.test(v || "");
  if (isId(s)) return s;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
  } catch {
    return "";
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id = "";
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = (url.pathname.match(/^\/(?:shorts|live|embed|v)\/([\w-]{11})/) || [])[1];
  }
  return isId(id) ? id : "";
}

export async function fetchLatestYoutubeVideo(channelUrl) {
  const res = await fetch(`${AUTH_BASE_URL}/latest-youtube?channel=${encodeURIComponent(channelUrl)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Couldn't fetch the latest video (${res.status})`);
  }
  return res.json();
}

export async function fetchTiktokOembed(videoUrl) {
  const res = await fetch(`${AUTH_BASE_URL}/tiktok-oembed?url=${encodeURIComponent(videoUrl)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Couldn't fetch that TikTok video (${res.status})`);
  }
  return res.json();
}
