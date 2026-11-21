// Captures live LI.FI routes, computes facts, lets the agent pick, and freezes
// everything into a hashed snapshot.
//   node scripts/10-agent-pick.mjs --case A --mode faithful
//   node scripts/10-agent-pick.mjs --case B --mode preferred [--bridge stargateV2]
//   node scripts/10-agent-pick.mjs --dry-run --mode preferred   (Level 1: nothing on-chain, nothing committed)
//   add --fixture <file> to replay a saved LI.FI response instead of calling the API
import fs from "node:fs";
import path from "node:path";
import { fetchRoutes, DEMO_REQUEST } from "../lib/lifi.mjs";
import { computeFacts, bestInTime, pick, compare, MANDATE, MANDATE_LIMITS } from "../lib/facts.mjs";
import { sha256Hex, sha256File, buildEvidence, defaultPosition } from "../lib/evidence.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const dry = args.includes("--dry-run");
const mode = opt("mode", "faithful");
const bridge = opt("bridge", "stargateV2");
const caseId = opt("case", dry ? "DRY" : null);
const fixture = opt("fixture", null);
if (!caseId) throw new Error("--case A|B required (or --dry-run)");

let capturedAt, rawText, raw;
if (fixture) {
  rawText = fs.readFileSync(fixture, "utf8");
  raw = JSON.parse(rawText);
  capturedAt = opt("captured-at", "fixture");
} else {
  capturedAt = new Date().toISOString();
  ({ text: rawText, json: raw } = await fetchRoutes(DEMO_REQUEST));
}

const facts = computeFacts(raw, MANDATE_LIMITS);
const best = bestInTime(facts);
if (!best) throw new Error("no route arrives within 10 minutes; re-capture");
const chosen = pick(facts, mode, { bridge });
const chosenVsBest = compare(chosen, best);

const caseRef = `${caseId}-${capturedAt.slice(0, 10).replace(/-/g, "")}-${capturedAt.slice(11, 19).replace(/:/g, "")}`;
const snapshot = {
  caseRef,
  capturedAt,
  request: DEMO_REQUEST,
  mandate: MANDATE,
  mandateLimits: MANDATE_LIMITS,
  agentMode: mode,
  ...(mode === "preferred" ? { agentPreferredBridge: bridge } : {}),
  chosenRouteId: chosen.id,
  facts,
  chosenVsBest,
  lifiResponseSha256: sha256Hex(rawText),
  lifiResponse: raw,
};

const dir = dry ? path.join("data", "dry-run", caseRef) : path.join("cases", caseRef);
fs.mkdirSync(dir, { recursive: true });
const snapPath = path.join(dir, "snapshot.json");
fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "lifi-raw.json"), rawText); // exact LI.FI bytes, hash in snapshot
const sha256 = sha256File(snapPath); // over the bytes exactly as written
fs.writeFileSync(path.join(dir, "snapshot.sha256"), `${sha256}  snapshot.json\n`);

if (!dry) {
  const idxPath = path.join("cases", "index.json");
  const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, "utf8")) : {};
  idx[caseId] = { caseRef, dir: dir.replace(/\\/g, "/"), sha256, mode, capturedAt };
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2) + "\n");
}

// Report
const usd = (x) => x.toFixed(4).padStart(10);
console.log(`case ${caseRef}  mode ${mode}${mode === "preferred" ? ` (${bridge})` : ""}  captured ${capturedAt}  routes ${facts.length}`);
console.log(`\n   ${"tools".padEnd(26)}${"net USD".padStart(10)}${"on top".padStart(9)}${"secs".padStart(7)} hops  in time  tags`);
[...facts]
  .sort((a, b) => b.netReceivedUSD - a.netReceivedUSD)
  .forEach((f) => {
    const mark = f.id === chosen.id ? (f.id === best.id ? "=>*" : "=> ") : f.id === best.id ? "  *" : "   ";
    console.log(`${mark}${f.tools.join(" > ").slice(0, 25).padEnd(26)}${usd(f.netReceivedUSD)}${f.onTopFeesUSD.toFixed(4).padStart(9)}${String(f.durationSec).padStart(7)}  ${f.hops}    ${f.withinTime ? "yes" : "NO "}     ${f.tags.join(",")}`);
  });
console.log(`\n=> agent chose   * best in-time route`);
console.log(`chosen vs best: ${chosenVsBest.netDiffUSD} USD (${chosenVsBest.netDiffPct}%) less, durationDiff ${chosenVsBest.durationDiffSec}s, stepDiff ${chosenVsBest.stepDiff}`);
console.log(`\nsnapshot: ${snapPath}\nsha256:   ${sha256}`);

const evidence = buildEvidence({ snapshot, sha256, position: defaultPosition("USER", snapshot), party: "USER" });
console.log(`\n--- EVIDENCE STRING THE COURT WOULD RECEIVE (USER side, ${evidence.length} chars, limit 4000) ---\n${evidence}`);
