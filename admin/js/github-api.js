import { REPO, BRANCH } from "./config.js";

const API = "https://api.github.com";

function authHeaders(token) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// UTF-8 safe base64 helpers. `btoa`/`atob` only handle binary strings, so
// text content (which may have em-dashes, emoji, etc.) has to go through
// TextEncoder/TextDecoder first — running raw bytes through these instead
// would corrupt anything non-ASCII.
export function encodeUtf8Base64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
function decodeBase64Utf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

async function apiFetch(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...authHeaders(token), ...(options.headers || {}) },
  });
  return res;
}

export async function listDir(token, dirPath) {
  const res = await apiFetch(token, `/repos/${REPO}/contents/${dirPath}?ref=${BRANCH}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Couldn't list ${dirPath} (${res.status})`);
  return res.json();
}

// Returns { sha, text } — `text` is UTF-8 decoded file content, or null if missing.
export async function getFile(token, filePath) {
  const res = await apiFetch(token, `/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't read ${filePath} (${res.status})`);
  const json = await res.json();
  return { sha: json.sha, text: decodeBase64Utf8(json.content) };
}

async function errorMessage(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return body.message || fallback;
}

// GitHub returns 409 when the `sha` we sent doesn't match the file's current
// sha — i.e. it changed on GitHub since we last read it. Marking the error
// lets callers offer "reload the latest version" instead of a generic alert.
async function apiError(res, fallback) {
  const err = new Error(await errorMessage(res, fallback));
  if (res.status === 409) err.conflict = true;
  return err;
}

// `base64Content` must already be base64 — callers pass `encodeUtf8Base64(text)`
// for text files, or raw base64 image bytes for uploads. Omit `sha` to create.
export async function putFileRaw(token, filePath, base64Content, message, sha) {
  const body = { message, content: base64Content, branch: BRANCH };
  if (sha) body.sha = sha;
  const res = await apiFetch(token, `/repos/${REPO}/contents/${filePath}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res, `Couldn't save ${filePath} (${res.status})`);
  return res.json();
}

export async function putTextFile(token, filePath, text, message, sha) {
  return putFileRaw(token, filePath, encodeUtf8Base64(text), message, sha);
}

export async function deleteFile(token, filePath, message, sha) {
  const res = await apiFetch(token, `/repos/${REPO}/contents/${filePath}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: BRANCH }),
  });
  if (!res.ok) throw await apiError(res, `Couldn't delete ${filePath} (${res.status})`);
  return res.json();
}
