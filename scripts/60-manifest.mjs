// Writes deployments/base-sepolia/manifest.json: every tx, agreement, verdict, reasoning and balance.
import fs from "node:fs";
import { ADDR, EXPLORER } from "../lib/court.mjs";
import { JUDGE_ADDRESS } from "../lib/genlayer.mjs";
import { loadCase } from "../lib/cases.mjs";
import { sha256File } from "../lib/evidence.mjs";

const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const idx = JSON.parse(fs.readFileSync("cases/index.json", "utf8"));
const txlog = fs.existsSync("data/txlog.jsonl") ? fs.readFileSync("data/txlog.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
const link = (h) => `${EXPLORER}/tx/${h}`;

const cases = {};
for (const id of Object.keys(idx)) {
  const c = loadCase(id);
  const best = c.snapshot.facts.find((f) => f.id === c.snapshot.chosenVsBest.bestRouteId);
  const chosen = c.snapshot.facts.find((f) => f.id === c.snapshot.chosenRouteId);
  cases[id] = {
    caseRef: c.snapshot.caseRef,
    agentMode: c.snapshot.agentMode,
    capturedAt: c.snapshot.capturedAt,
    snapshot: { path: `${c.dir.replace(/\\/g, "/")}/snapshot.json`, sha256: sha256File(`${c.dir}/snapshot.json`), lifiResponseSha256: c.snapshot.lifiResponseSha256, routes: c.snapshot.facts.length },
    chosen: { tools: chosen.tools, netReceivedUSD: chosen.netReceivedUSD, durationSec: chosen.durationSec, onTopFeesUSD: chosen.onTopFeesUSD },
    bestInTime: { tools: best.tools, netReceivedUSD: best.netReceivedUSD, durationSec: best.durationSec },
    chosenVsBest: c.snapshot.chosenVsBest,
    internetCourt: c.agreement && {
      agreement: c.agreement.agreement,
      agreementLink: `${EXPLORER}/address/${c.agreement.agreement}`,
      id: c.agreement.id,
      statement: c.agreement.statement,
      terms: c.agreement.terms,
      createTx: link(c.agreement.createTx),
      evidenceTx: c.dispute?.evidenceTx && link(c.dispute.evidenceTx),
      evidenceSubmittedBy: c.dispute?.winner,
      verdict: c.genlayer && read(`${c.dir}/resolution.json`)?.verdict,
      resolutionReasoning: read(`${c.dir}/resolution.json`)?.reasoning,
      claimTx: read(`${c.dir}/resolution.json`)?.claimTx && link(read(`${c.dir}/resolution.json`).claimTx),
      balancesBefore: read(`${c.dir}/resolution.json`)?.balancesBefore,
      balancesAfter: read(`${c.dir}/resolution.json`)?.balancesAfter,
    },
    genlayer: c.genlayer && { judge: c.genlayer.contract, chain: c.genlayer.chain, tx: c.genlayer.tx, verdict: c.genlayer.verdict, reasoning: c.genlayer.reasoning },
    verdictsMatch: read(`${c.dir}/resolution.json`)?.match ?? null,
  };
}

const manifest = {
  project: "Route Court: LI.FI x Internet Court x GenLayer",
  generatedAt: new Date().toISOString(),
  networks: { baseSepolia: 84532, genlayerStudioNext: 61997 },
  contracts: { internetCourtFactory: ADDR.factory, bridgeReceiver: ADDR.bridgeReceiver, mockUSDC: ADDR.mockUSDC, routeJudge: JUDGE_ADDRESS },
  wallets: read("deployments/base-sepolia/wallets.json"),
  juryRelay: "Internet Court's GenLayer relay delivered no verdict on Base Sepolia since 2026-03-19 (see discovery/GATE0.md). Fallback B: Route Court judge on GenLayer Studio Next rules; only the favoured side submits evidence; resolveByDefault settles.",
  cases,
  guards: read("deployments/base-sepolia/guards.json"),
  transactions: txlog.map((t) => ({ ...t, link: link(t.hash) })),
};
fs.writeFileSync("deployments/base-sepolia/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest: ${Object.keys(cases).length} cases, ${manifest.guards?.length ?? 0} guards, ${txlog.length} logged txs -> deployments/base-sepolia/manifest.json`);
