import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { computeFacts, bestInTime, pick, compare, MANDATE } from "../lib/facts.mjs";
import { buildEvidence, defaultPosition, sha256File } from "../lib/evidence.mjs";
import { DEMO_REQUEST } from "../lib/lifi.mjs";

// Real LI.FI response captured 2026-11-21T15:33:03Z (1,000 USDC Base -> Arbitrum).
const raw = JSON.parse(fs.readFileSync("tests/fixtures/lifi-routes-20261121.json", "utf8"));
const facts = computeFacts(raw);
const byTool = (k) => facts.find((f) => f.toolKeys.includes(k));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("maps all 13 routes", () => assert.equal(facts.length, 13));

test("LI.FI fee step is not counted as a hop", () => {
  for (const f of facts) assert.equal(f.hops, 1);
  near(byTool("lifiIntents").lifiFeeUSD, 2.4916);
});

test("net received = delivered - gas - fees paid on top", () => {
  near(byTool("lifiIntents").netReceivedUSD, 997.417651 - 0.0038);
  near(byTool("stargateV2").onTopFeesUSD, 1.3344);
  near(byTool("stargateV2").netReceivedUSD, 996.894517 - 0.0058 - 1.3344);
  near(byTool("glacis").onTopFeesUSD, 0.2976);
});

test("10 minute limit is applied to the estimate", () => {
  assert.equal(byTool("polymerStandard").withinTime, false); // 1080 s
  assert.equal(byTool("lifiIntents").withinTime, true); // 6 s
});

test("faithful agent skips the cheapest-but-too-slow route", () => {
  const b = bestInTime(facts);
  assert.equal(b.toolKeys[0], "lifiIntents");
  assert.equal(pick(facts, "faithful").id, b.id);
  assert.notEqual(b.id, facts.find((f) => f.tags.includes("CHEAPEST")).id);
});

test("preferred-bridge agent picks StargateV2 and loses about $1.86", () => {
  const c = pick(facts, "preferred", { bridge: "stargateV2" });
  const d = compare(c, bestInTime(facts));
  near(d.netDiffUSD, 997.413851 - 995.554317);
  assert.ok(d.netDiffPct > 0.18 && d.netDiffPct < 0.19);
  assert.equal(d.durationDiffSec, 6 - 27); // chosen is 21 s slower
  assert.equal(d.stepDiff, 0);
});

test("lazy agent picks a FASTEST-tagged route", () => {
  assert.ok(pick(facts, "lazy").tags.includes("FASTEST"));
});

test("preferred bridge missing is an error, not a silent fallback", () => {
  assert.throws(() => pick(facts, "preferred", { bridge: "noSuchBridge" }));
});

test("evidence fits 4000 chars and quotes the hash, mandate and both routes", () => {
  const c = pick(facts, "preferred");
  const snapshot = { facts, chosenRouteId: c.id, chosenVsBest: compare(c, bestInTime(facts)), mandate: MANDATE, capturedAt: "2026-11-21T15:33:03.289Z", request: DEMO_REQUEST };
  const sha = "ab".repeat(32);
  for (const party of ["USER", "AGENT"]) {
    const ev = buildEvidence({ snapshot, sha256: sha, position: defaultPosition(party, snapshot), party, sourceUrl: "https://example.org/x", genlayer: { contract: "0x" + "1".repeat(40), tx: "0x" + "2".repeat(64), verdict: "TRUE" } });
    assert.ok(ev.length <= 4000, `length ${ev.length}`);
    assert.ok(ev.startsWith(`SNAPSHOT sha256: ${sha}`));
    assert.ok(ev.includes(MANDATE));
    assert.ok(ev.includes("AGENT CHOSE: StargateV2"));
    assert.ok(ev.includes("BEST IN-TIME ROUTE: LI.FI Intents"));
  }
});

test("sha256File hashes exact file bytes", () => {
  const p = path.join(os.tmpdir(), `rc-${process.pid}.json`);
  fs.writeFileSync(p, '{"a":1}\n');
  assert.equal(sha256File(p), crypto.createHash("sha256").update('{"a":1}\n').digest("hex"));
});
