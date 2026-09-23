import assert from "node:assert/strict";
import { activeWindow, captureClosing, sendFailureAlert } from "../closing-cron/index.js";
import worker from "../closing-cron/index.js";

const utc = s => new Date(s + "Z");
// 2026-09-23 is a Wednesday.
assert.equal(activeWindow(utc("2026-09-23T11:59:00")), false, "Wednesday morning is quiet");
assert.equal(activeWindow(utc("2026-09-23T12:00:00")), true, "Wednesday from 12:00 is active");
assert.equal(activeWindow(utc("2026-09-24T03:00:00")), true, "Thursday is active");
assert.equal(activeWindow(utc("2026-09-25T07:59:00")), true, "Friday before 08:00 is active");
assert.equal(activeWindow(utc("2026-09-25T08:00:00")), false, "Friday from 08:00 is quiet");
assert.equal(activeWindow(utc("2026-09-26T11:00:00")), false, "Saturday morning is quiet");
assert.equal(activeWindow(utc("2026-09-26T12:00:00")), true, "Saturday from 12:00 is active");
assert.equal(activeWindow(utc("2026-09-27T20:00:00")), true, "Sunday is active");
assert.equal(activeWindow(utc("2026-09-28T23:00:00")), true, "Monday is active");
assert.equal(activeWindow(utc("2026-09-29T07:59:00")), true, "Tuesday before 08:00 is active");
assert.equal(activeWindow(utc("2026-09-29T08:00:00")), false, "Tuesday from 08:00 is quiet");

const env = { MAINTENANCE_TOKEN: "fixture-token-only-01234567890123456789" };
const noWait = async () => {};
const ok = () => new Response(JSON.stringify({ success: true }), { status: 200 });

const calls = [];
await captureClosing(env, async (url, init) => { calls.push({ url, init }); return ok(); }, noWait);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, "https://betthisguy.com/api/maintenance?job=closing");
assert.equal(calls[0].init.method, "POST");
assert.equal(calls[0].init.redirect, "manual");
assert.equal(calls[0].init.headers.Authorization, "Bearer " + env.MAINTENANCE_TOKEN);

let attempts = 0;
await captureClosing(env, async () => (++attempts === 1 ? new Response("", { status: 503 }) : ok()), noWait);
assert.equal(attempts, 2, "retries once after a failure");

await assert.rejects(captureClosing(env, async () => new Response("", { status: 503 }), noWait), /HTTP 503/);
await assert.rejects(captureClosing(env, async () => new Response(JSON.stringify({ success: false })), noWait), /did not complete/);
await assert.rejects(captureClosing({}, async () => ok(), noWait), /MAINTENANCE_TOKEN/);

const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected provider call"); };
await worker.scheduled({ scheduledTime: utc("2026-09-23T09:00:00").getTime() }, env);
globalThis.fetch = realFetch;

// Failure alerts go to ntfy only when a topic is configured, and never mask the original error.
const alerts = [];
const alertFetch = async (url, init) => { alerts.push({ url, init }); return new Response("", { status: 200 }); };
assert.equal(await sendFailureAlert({}, "HTTP 503", alertFetch), false, "no topic, no alert");
assert.equal(alerts.length, 0);
assert.equal(await sendFailureAlert({ ALERT_NTFY_TOPIC: "btg-test topic" }, "HTTP 503", alertFetch), true);
assert.equal(alerts[0].url, "https://ntfy.sh/btg-test%20topic");
assert.equal(alerts[0].init.method, "POST");
assert.match(alerts[0].init.body, /HTTP 503/);
assert.ok(!alerts[0].init.body.includes(env.MAINTENANCE_TOKEN), "alert never includes the token");
assert.equal(await sendFailureAlert({ ALERT_NTFY_TOPIC: "t" }, "x", async () => { throw new Error("offline"); }), false, "alert failures are swallowed");

const alertEnv = { ...env, ALERT_NTFY_TOPIC: "btg-test" };
const sent = [];
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://ntfy.sh/")) { sent.push(init.body); return new Response("", { status: 200 }); }
  return new Response("", { status: 503 });
};
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realTimeout(fn, 0);
await assert.rejects(worker.scheduled({ scheduledTime: utc("2026-09-27T20:00:00").getTime() }, alertEnv), /Closing-line capture failed: HTTP 503/);
globalThis.setTimeout = realTimeout;
assert.equal(sent.length, 1, "one alert per failed run");
assert.match(sent[0], /HTTP 503/);
globalThis.fetch = realFetch;

console.log("PASS: closing-line cron follows the NFL windows, retries once, fails loudly, alerts on failure and skips quiet periods");
