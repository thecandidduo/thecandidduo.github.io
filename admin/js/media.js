// Client for the worker's /latest-youtube and /tiktok-oembed endpoints (see
// oauth-worker/worker.js). Both are plain public data lookups — no API key,
// no auth needed on these two routes — just a server-side fetch the browser
// can't make itself due to CORS.

import { AUTH_BASE_URL } from "./config.js";

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
