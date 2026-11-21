// Builds site/data.json for the static page from the committed manifest and snapshots.
import fs from "node:fs";
import { MANDATE } from "../lib/facts.mjs";

const m = JSON.parse(fs.readFileSync("deployments/base-sepolia/manifest.json", "utf8"));
const REPO = "https://github.com/DaveDave-infosec/route-court";
const out = {
  generatedAt: m.generatedAt,
  repo: REPO,
  mandate: MANDATE,
  contracts: m.contracts,
  wallets: m.wallets,
  guards: (m.guards ?? []).map((g) => ({ guard: g.guard, reason: g.reason ?? (g.refused ? "Refused before sending" : ""), tx: g.tx ?? null })),
  cases: {},
};
for (const id of ["A", "B"]) {
  const c = m.cases[id];
  if (!c) continue;
  const snap = JSON.parse(fs.readFileSync(c.snapshot.path, "utf8"));
  out.cases[id] = {
    caseRef: c.caseRef,
    agentMode: c.agentMode,
    agentPolicy: c.agentMode === "faithful" ? "Picks the most money delivered among routes that arrive within 10 minutes." : "Always uses its hardcoded bridge, StargateV2.",
    capturedAt: c.capturedAt,
    snapshot: { sha256: c.snapshot.sha256, url: `${REPO}/blob/main/${c.snapshot.path}` },
    routes: snap.facts.map((f) => ({ id: f.id, tools: f.tools, net: f.netReceivedUSD, onTop: f.onTopFeesUSD, secs: f.durationSec, hops: f.hops, tags: f.tags, inTime: f.withinTime })),
    chosenId: snap.chosenRouteId,
    bestId: snap.chosenVsBest.bestRouteId,
    diff: snap.chosenVsBest,
    genlayer: c.genlayer,
    court: c.internetCourt,
  };
}
fs.writeFileSync("site/data.json", JSON.stringify(out, null, 2) + "\n");
console.log(`site/data.json: ${Object.keys(out.cases).length} cases, ${out.cases.B?.routes.length} routes in B`);
