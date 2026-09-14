import { AUTH_BASE_URL } from "./config.js";

const TOKEN_KEY = "candidduo_cms_token";

// Matches the handshake oauth-worker/worker.js implements (same protocol
// Decap/Netlify CMS uses): the popup announces itself with
// "authorizing:github", we echo that back to prove we're the real opener,
// then it sends the actual token payload.
export function login() {
  return new Promise((resolve, reject) => {
    const popup = window.open(`${AUTH_BASE_URL}/auth?scope=repo,user`, "candidduo-oauth", "width=600,height=700");
    if (!popup) {
      reject(new Error("Popup blocked — please allow popups for this site and try again."));
      return;
    }

    let settled = false;
    function cleanup() {
      settled = true;
      window.removeEventListener("message", handleMessage);
      clearInterval(closeTimer);
    }
    function handleMessage(e) {
      if (typeof e.data !== "string") return;
      if (e.data === "authorizing:github") {
        popup.postMessage("authorizing:github", "*");
        return;
      }
      if (e.data.startsWith("authorization:github:success:")) {
        const payload = JSON.parse(e.data.slice("authorization:github:success:".length));
        cleanup();
        popup.close();
        resolve(payload.token);
      }
    }
    window.addEventListener("message", handleMessage);

    const closeTimer = setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error("Login popup closed before finishing — the GitHub OAuth App or worker secrets may be misconfigured."));
      }
    }, 500);
  });
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function fetchCurrentUser(token) {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error("Could not verify GitHub login (token may be invalid or expired).");
  return res.json();
}
