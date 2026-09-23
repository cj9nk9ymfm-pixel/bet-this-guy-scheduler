import assert from "node:assert/strict";
import { activeWindow, captureClosing } from "../closing-cron/index.js";
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

console.log("PASS: closing-line cron follows the NFL windows, retries once, fails loudly and skips quiet periods");
