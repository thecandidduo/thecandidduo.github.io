// Tests for the worker's traffic counter (/hit + /stats), run against the REAL
// worker.js and a real SQLite database (D1 is SQLite underneath).
//   node --test oauth-worker/test/            (Node 22+, no dependencies)
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// worker.js has no package.json beside it, so import a .mjs copy to be sure it loads as ESM.
const here = path.dirname(fileURLToPath(import.meta.url));
const copy = path.join(os.tmpdir(), `worker-under-test-${process.pid}.mjs`);
fs.copyFileSync(path.join(here, "..", "worker.js"), copy);
let worker;
let instance = 0;
// A fresh module instance per test, so the worker's warm-isolate memory (tables created,
// today's salt) never leaks from one test into the next.
const freshWorker = async () => (await import(pathToFileURL(copy).href + "?n=" + ++instance)).default;
after(() => fs.rmSync(copy, { force: true }));

// ---- a minimal D1 look-alike on node:sqlite ----
function makeD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async run() { const r = db.prepare(sql).run(...args); return { results: [], meta: { changes: Number(r.changes) } }; },
    _do() {
      const s = db.prepare(sql);
      if (/^\s*select/i.test(sql)) return { results: s.all(...args).map((r) => ({ ...r })), meta: {} };
      return { results: [], meta: { changes: Number(s.run(...args).changes) } };
    },
  });
  return { prepare: (sql) => stmt(sql), async batch(list) { return list.map((s) => s._do()); }, raw: db };
}

const SITE = "https://thecandidduo.github.io";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const GOOD = "good-token";
let env, waits, realFetch, realNow, clock;

async function call(url, init = {}, { cf } = {}) {
  const req = new Request(url, init);
  if (cf) Object.defineProperty(req, "cf", { value: cf });
  waits = [];
  const res = await worker.fetch(req, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return res;
}
const hit = (body, { origin = SITE, ua = CHROME, ip = "203.0.113.7", country = "SG" } = {}) =>
  call("https://w.test/hit", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { origin, "user-agent": ua, "cf-connecting-ip": ip, "content-type": "text/plain" },
  }, { cf: { country } });
const stats = (days = 30, token = GOOD) =>
  call(`https://w.test/stats?days=${days}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
const rows = (sql) => env.DB.raw.prepare(sql).all().map((r) => ({ ...r }));

before(() => {
  realFetch = globalThis.fetch;
  realNow = Date.now;
  // Stand-in for GitHub's "does this token have push access?" call.
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.github.com/repos/")) {
      const t = String(init?.headers?.authorization || "").replace(/^Bearer\s+/i, "");
      if (t === GOOD) return new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 });
      if (t === "read-only") return new Response(JSON.stringify({ permissions: { push: false } }), { status: 200 });
      return new Response("{}", { status: 401 });
    }
    return realFetch(url, init);
  };
});
after(() => { globalThis.fetch = realFetch; Date.now = realNow; });

beforeEach(async () => {
  worker = await freshWorker();
  clock = Date.parse("2026-09-26T04:00:00Z"); // 12:00 in Singapore
  Date.now = () => clock;
  env = { DB: makeD1(), GITHUB_REPO: "thecandidduo/thecandidduo.github.io" }; // note: no GEMINI_API_KEY on purpose
});

test("/hit answers 204 and counts a page view, referrer, country and device", async () => {
  const res = await hit({ p: "/stories/jeju-in-winter/", r: "www.google.com" });
  assert.equal(res.status, 204);
  const [h] = rows("SELECT * FROM hits");
  assert.deepEqual({ ...h }, { day: "2026-09-26", path: "/stories/jeju-in-winter/", ref: "google.com", country: "SG", device: "desktop", views: 1 });
  assert.equal(rows("SELECT * FROM uniques")[0].visitors, 1);
});

test("the same visitor counts as many views but ONE unique; a new visitor adds one", async () => {
  await hit({ p: "/" }); await hit({ p: "/stories/" }); await hit({ p: "/" });
  assert.equal(rows("SELECT SUM(views) n FROM hits")[0].n, 3);
  assert.equal(rows("SELECT visitors FROM uniques")[0].visitors, 1);
  await hit({ p: "/" }, { ip: "198.51.100.9" });
  assert.equal(rows("SELECT visitors FROM uniques")[0].visitors, 2);
});

test("query strings and hashes are stripped; index.html is normalised", async () => {
  await hit({ p: "/stories/x/?utm_source=ig#top" });
  await hit({ p: "/about/index.html" });
  assert.deepEqual(rows("SELECT path FROM hits ORDER BY path").map((r) => r.path), ["/about/", "/stories/x/"]);
});

test("mobile and tablet are recognised; a missing country is stored as empty", async () => {
  await hit({ p: "/" }, { ua: IPHONE, country: "" });
  const [h] = rows("SELECT * FROM hits");
  assert.equal(h.device, "mobile");
  assert.equal(h.country, "");
});

test("ignores bots, wrong or missing Origin, junk bodies and unsafe paths", async () => {
  // Nothing valid has been counted yet, so the tables don't even exist — ignoring must not touch the DB.
  const before = () => { try { return rows("SELECT COALESCE(SUM(views), 0) n FROM hits")[0].n; } catch { return 0; } };
  for (const ua of ["Googlebot/2.1", "Mozilla/5.0 (compatible; bingbot/2.0)", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "curl/8.4.0", "python-requests/2.31", "Mozilla/5.0 HeadlessChrome/126", "Chrome-Lighthouse", ""])
    await hit({ p: "/" }, { ua });
  await hit({ p: "/" }, { origin: "https://evil.example" });
  await hit({ p: "/" }, { origin: "" });
  await hit("not json");
  await hit({ p: "no-leading-slash" });
  await hit({ p: "/x'; DROP TABLE hits;--" });
  await hit({ p: "/<script>alert(1)</script>" });
  await hit({ p: "/" + "a".repeat(300) });
  await hit({});
  assert.equal(before(), 0);
  // ...and real browsers are not mistaken for bots
  for (const ua of [CHROME, IPHONE, "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"]) await hit({ p: "/" }, { ua });
  assert.equal(before(), 3);
});

test("junk referrers are dropped; the visitor's own site is not a referrer", async () => {
  await hit({ p: "/", r: "not a host!" });
  await hit({ p: "/", r: "localhost" });
  assert.deepEqual(rows("SELECT DISTINCT ref FROM hits"), [{ ref: "" }]);
});

test("PRIVACY: no IP address, user agent or raw identifier is stored anywhere", async () => {
  await hit({ p: "/", r: "google.com" }, { ip: "203.0.113.7" });
  const everything = JSON.stringify(["hits", "uniques", "seen", "salts"].map((t) => rows(`SELECT * FROM ${t}`)));
  assert.ok(!everything.includes("203.0.113.7"), "IP address leaked into the database");
  assert.ok(!everything.includes("Mozilla"), "user agent leaked into the database");
  assert.match(rows("SELECT hash FROM seen")[0].hash, /^[0-9a-f]{24}$/);
});

test("a visitor is a NEW unique the next day (salt rotates), and old hashes/salts are purged", async () => {
  await hit({ p: "/" });
  const day1 = rows("SELECT hash FROM seen")[0].hash;
  clock += 86400000; // +1 day
  await hit({ p: "/" });
  assert.deepEqual(rows("SELECT day, visitors FROM uniques ORDER BY day").map((r) => r.visitors), [1, 1]);
  const hashes = rows("SELECT hash FROM seen").map((r) => r.hash);
  assert.equal(hashes.length, 2);
  assert.notEqual(hashes[0], hashes[1], "same person must hash differently on different days");
  clock += 2 * 86400000; // +3 days from the start
  await hit({ p: "/" });
  assert.deepEqual(rows("SELECT day FROM seen ORDER BY day").map((r) => r.day), ["2026-09-29"]); // only today's survive
  assert.equal(rows("SELECT COUNT(*) n FROM salts")[0].n, 1);
  assert.equal(rows("SELECT SUM(visitors) n FROM uniques")[0].n, 3, "daily unique counts are kept forever");
  assert.ok(day1);
});

test("days roll over at midnight Singapore time, not UTC", async () => {
  clock = Date.parse("2026-09-26T15:59:00Z"); // 23:59 SGT on the 26th
  await hit({ p: "/" });
  clock = Date.parse("2026-09-26T16:01:00Z"); // 00:01 SGT on the 27th
  await hit({ p: "/" });
  assert.deepEqual(rows("SELECT DISTINCT day FROM hits ORDER BY day").map((r) => r.day), ["2026-09-26", "2026-09-27"]);
});

test("/hit never fails the page even if the database is broken or missing", async () => {
  env.DB = { prepare() { throw new Error("db down"); }, batch() { throw new Error("db down"); } };
  assert.equal((await hit({ p: "/" })).status, 204);
  delete env.DB;
  assert.equal((await hit({ p: "/" })).status, 204);
  assert.equal((await call("https://w.test/hit")).status, 204); // GET with no body
});

test("/stats: totals, zero-filled days, top lists, previous period, first day", async () => {
  // Two days ago: 2 views by one visitor. Today: 3 views by two visitors.
  clock -= 2 * 86400000;
  await hit({ p: "/stories/a/", r: "google.com" }); await hit({ p: "/stories/a/", r: "google.com" });
  clock += 2 * 86400000;
  await hit({ p: "/", r: "instagram.com" }, { country: "ID", ip: "1.1.1.1" });
  await hit({ p: "/stories/a/" }, { ua: IPHONE, country: "ID", ip: "2.2.2.2" });
  await hit({ p: "/stories/a/" }, { ua: IPHONE, country: "ID", ip: "2.2.2.2" });

  const res = await stats(7);
  assert.equal(res.status, 200);
  const s = await res.json();
  assert.equal(s.days, 7);
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily[6].day, "2026-09-26");
  assert.deepEqual(s.daily.map((d) => d.views), [0, 0, 0, 0, 2, 0, 3]);
  assert.deepEqual(s.daily.map((d) => d.visitors), [0, 0, 0, 0, 1, 0, 2]);
  assert.deepEqual(s.totals, { views: 5, visitors: 3 });
  assert.deepEqual(s.pages[0], { name: "/stories/a/", views: 4 });
  assert.deepEqual(s.referrers.map((r) => r.name).sort(), ["", "google.com", "instagram.com"].sort());
  assert.equal(s.countries.find((c) => c.name === "ID").views, 3);
  assert.deepEqual(s.devices.map((d) => d.name).sort(), ["desktop", "mobile"]);
  assert.equal(s.firstDay, "2026-09-24");
  assert.deepEqual(s.previous, { views: 0, visitors: 0 });

  // A 2-day window (25th-26th) leaves the earlier 2 views (24th) in the "previous" period.
  const s2 = await (await stats(2)).json();
  assert.equal(s2.totals.views, 3);
  assert.deepEqual(s2.previous, { views: 2, visitors: 1 });
});

test("/stats access rules (and it works without any Gemini key)", async () => {
  assert.equal((await stats(30, null)).status, 401);
  assert.equal((await stats(30, "nonsense")).status, 401);
  assert.equal((await stats(30, "read-only")).status, 403);
  const noRepo = { ...env }; delete noRepo.GITHUB_REPO; env = noRepo;
  const res = await stats(30);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, "missing_secret");
});

test("/stats explains a missing database instead of crashing; days is clamped", async () => {
  const noDb = { ...env }; delete noDb.DB; env = noDb;
  const res = await stats(30);
  assert.equal(res.status, 501);
  assert.equal((await res.json()).error, "no_database");
  env.DB = makeD1();
  assert.equal((await (await stats(9999)).json()).days, 365);
  assert.equal((await (await stats(0)).json()).days, 30); // 0 is not a valid range -> default
});

test("recovers on its own if the database is swapped for a fresh one while the worker is warm", async () => {
  await hit({ p: "/" });
  assert.equal(rows("SELECT COUNT(*) n FROM hits")[0].n, 1);
  env.DB = makeD1(); // brand-new, empty database, same warm worker
  await hit({ p: "/second/" });
  assert.deepEqual(rows("SELECT path FROM hits").map((r) => r.path), ["/second/"]);
  assert.equal((await (await stats(7)).json()).totals.views, 1);
});

test("the other routes still behave", async () => {
  assert.match(await (await call("https://w.test/")).text(), /auth worker is running/);
  assert.equal((await call("https://w.test/nope")).status, 404);
  assert.equal((await call("https://w.test/stats", { method: "OPTIONS" })).status, 200);
  assert.equal((await call("https://w.test/stats", { method: "POST" })).status, 405);
});
