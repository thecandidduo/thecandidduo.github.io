// Client for the worker's /generate-story and /fetch-product endpoints (see
// oauth-worker/worker.js). The worker holds the real Gemini API key
// server-side and only accepts requests from a GitHub session with push
// access to this repo.

import { AUTH_BASE_URL } from "./config.js";

export const MAX_AI_IMAGES = 6;
export const MAX_AI_DOCUMENTS = 3;

export async function generateStory(token, { prompt, images = [], documents = [], notes = [] }) {
  const res = await fetch(`${AUTH_BASE_URL}/generate-story`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt, images, documents, notes }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `AI generation failed (${res.status})`);
  }
  return res.json();
}

export async function fetchProductDetails(token, url) {
  const res = await fetch(`${AUTH_BASE_URL}/fetch-product`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Fetch failed (${res.status})`);
  }
  return res.json();
}

export async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function isPdf(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}
