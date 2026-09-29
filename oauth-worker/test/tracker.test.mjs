// Tests for the public page-view script in _includes/analytics.html — the one piece of this
// feature that runs in every visitor's browser. It runs the REAL include (Liquid placeholders
// filled in) against a mocked browser, one scenario at a time.
//   node --test oauth-worker/test/tracker.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const include = fs.readFileSync(path.join(repo, "_includes/analytics.html"), "utf8");
const config = fs.readFileSync(path.join(repo, "_config.yml"), "utf8");
const siteUrl = config.match(/^url:\s*"?([^"\s#]+)"?/m)[1];
const statsUrl = config.match(/^stats_url:\s*"([^"]+)"/m)[1];
const HOST = siteUrl.replace(/^https?:\/\//, "");

const src = include
  .match(/<script>\s*(\(function \(\) \{[\s\S]*?\}\)\(\);)\s*<\/script>/)[1]
  .replace(/\{\{\s*site\.url[^}]*\}\}/, HOST)
  .replace(/\{\{\s*site\.stats_url\s*\}\}/, statsUrl);

function run({ host = HOST, path: p = "/stories/x/", referrer = "", dnt = null, webdriver = false, ignore = null, storageThrows = false, beacon = true } = {}) {
  const sent = { beacon: [], fetch: [] };
  const storage = { getItem(k) { if (storageThrows) throw new Error("SecurityError"); return k === "cd_ignore" ? ignore : null; } };
  const navigator = { doNotTrack: dnt, webdriver };
  if (beacon) navigator.sendBeacon = (url, blob) => (sent.beacon.push({ url, blob }), true);
  new Function("location", "navigator", "window", "localStorage", "document", "fetch", "Blob", "URL", src)(
    { hostname: host, pathname: p }, navigator, { doNotTrack: null }, storage, { referrer },
    (url, init) => sent.fetch.push({ url, init }), Blob, URL);
  return sent;
}
const body = async (s) => JSON.parse(await s.beacon[0].blob.text());

test("a normal visit sends ONE beacon to the worker's /hit with just the path and referrer", async () => {
  const s = run();
  assert.equal(s.beacon.length, 1);
  assert.equal(s.beacon[0].url, `${statsUrl}/hit`);
  assert.deepEqual(await body(s), { p: "/stories/x/", r: "" });
  assert.equal(s.beacon[0].blob.type, "text/plain"); // keeps it a "simple" request: no CORS preflight
});
test("referrers are reduced to a bare host (no www, path or query); the site itself isn't one", async () => {
  assert.equal((await body(run({ referrer: "https://www.google.com/search?q=jeju+food" }))).r, "google.com");
  assert.equal((await body(run({ referrer: `https://${HOST}/stories/` }))).r, "");
  const s = run({ referrer: "not a url" });
  assert.equal(s.beacon.length, 1); // a garbage referrer must not stop the visit being counted
  assert.equal((await body(s)).r, "");
});
test("sends nothing off the real site, for Do Not Track, automated browsers, or the owner's browser", () => {
  for (const o of [{ host: "localhost" }, { host: "evil.example" }, { dnt: "1" }, { webdriver: true }, { ignore: "1" }])
    assert.equal(run(o).beacon.length, 0, JSON.stringify(o));
});
test("a browser that blocks storage is still counted", () => {
  assert.equal(run({ storageThrows: true }).beacon.length, 1);
});
test("without sendBeacon it falls back to fetch (keepalive, no-cors)", () => {
  const s = run({ beacon: false });
  assert.equal(s.fetch.length, 1);
  assert.deepEqual([s.fetch[0].init.method, s.fetch[0].init.keepalive, s.fetch[0].init.mode], ["POST", true, "no-cors"]);
});
