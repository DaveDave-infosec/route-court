// GATE 0 (read-only). Confirms the Internet Court facts we rely on and
// decides: jury live, or Fallback B. Sends no transactions.
import fs from "node:fs";
import { ADDR, BLOCKSCOUT, factoryAbi, erc20Abi, publicClient, readAgreement, jsonSafe } from "../lib/court.mjs";

fs.mkdirSync("discovery", { recursive: true });
const line = (s = "") => console.log(s);

// 1. Factory basics
const [nextId, bridge, owner] = await Promise.all(
  ["nextAgreementId", "bridgeReceiver", "owner"].map((fn) =>
    publicClient.readContract({ address: ADDR.factory, abi: factoryAbi, functionName: fn })
  )
);
line("== FACTORY");
line(`nextAgreementId: ${nextId}`);
line(`bridgeReceiver:  ${bridge}  (expected ${ADDR.bridgeReceiver}) ${bridge.toLowerCase() === ADDR.bridgeReceiver.toLowerCase() ? "OK" : "MISMATCH"}`);
line(`owner:           ${owner}`);

// 2. MockUSDC
const [sym, dec] = await Promise.all(
  ["symbol", "decimals"].map((fn) => publicClient.readContract({ address: ADDR.mockUSDC, abi: erc20Abi, functionName: fn }))
);
line(`\n== MOCKUSDC  symbol ${sym}  decimals ${dec}`);

// 3. All factory logs from Blockscout (follows pagination)
const logs = [];
let params = "";
for (let page = 0; page < 40; page++) {
  const res = await fetch(`${BLOCKSCOUT}/addresses/${ADDR.factory}/logs${params}`);
  if (!res.ok) throw new Error(`blockscout ${res.status}`);
  const body = await res.json();
  logs.push(...body.items);
  if (!body.next_page_params) break;
  params = "?" + new URLSearchParams(body.next_page_params).toString();
}
fs.writeFileSync("discovery/factory-logs.json", JSON.stringify(logs, null, 2));
const evName = (l) => (l.decoded?.method_call || "UNDECODED").split("(")[0];
const counts = {};
for (const l of logs) counts[evName(l)] = (counts[evName(l)] || 0) + 1;
line(`\n== FACTORY LOGS (${logs.length} total, saved to discovery/factory-logs.json)`);
for (const [k, v] of Object.entries(counts)) line(`  ${k}: ${v}`);

const param = (l, n) => l.decoded?.parameters?.find((p) => p.name === n)?.value;
const tsCache = {};
async function blockTime(bn) {
  if (!tsCache[bn]) {
    // Blockscout, not the RPC: the public RPC prunes history before block 47.5M.
    const res = await fetch(`${BLOCKSCOUT}/blocks/${bn}`);
    if (!res.ok) throw new Error(`blockscout block ${bn}: ${res.status}`);
    tsCache[bn] = new Date((await res.json()).timestamp).toISOString();
  }
  return tsCache[bn];
}
for (const name of ["DisputeRequested", "VerdictReceived"]) {
  line(`\n== 5 most recent ${name}`);
  for (const l of logs.filter((x) => evName(x) === name).slice(0, 5)) {
    line(`  block ${l.block_number}  ${await blockTime(l.block_number)}  agreement ${param(l, "agreementAddress")}${name === "VerdictReceived" ? "  verdict " + param(l, "verdict") : ""}`);
  }
}

// 4. Disputes still waiting for a verdict
const verdicted = new Set(logs.filter((x) => evName(x) === "VerdictReceived").map((l) => String(param(l, "agreementAddress")).toLowerCase()));
const pending = logs.filter((x) => evName(x) === "DisputeRequested" && !verdicted.has(String(param(x, "agreementAddress")).toLowerCase()));
line(`\n== DisputeRequested with NO VerdictReceived: ${pending.length}`);
for (const p of pending) line(`  block ${p.block_number}  ${await blockTime(p.block_number)}  ${param(p, "agreementAddress")}`);

// 5. Last 6 agreements
line(`\n== LAST 6 AGREEMENTS`);
const snapshot = [];
for (let id = Number(nextId) - 1; id >= Math.max(0, Number(nextId) - 6); id--) {
  const addr = await publicClient.readContract({ address: ADDR.factory, abi: factoryAbi, functionName: "agreements", args: [BigInt(id)] });
  const a = await readAgreement(addr);
  snapshot.push({ id, addr, ...a });
  line(`  #${id} ${addr}  ${a.statusName}/${a.verdictName}  escrow ${a.escrowAmount}`);
  line(`     A ${a.partyA}  B ${a.partyB}`);
  line(`     statement: ${String(a.statement).slice(0, 110)}`);
  line(`     reasoning: ${String(a.reasoning).slice(0, 110) || "(empty)"}`);
}
fs.writeFileSync("discovery/last-agreements.json", JSON.stringify(snapshot, jsonSafe, 2));

// 6. Decision
const lastVerdict = logs.find((x) => evName(x) === "VerdictReceived");
const lastDispute = logs.find((x) => evName(x) === "DisputeRequested");
const lvTime = lastVerdict ? await blockTime(lastVerdict.block_number) : null;
const fresh = lvTime && Date.now() - Date.parse(lvTime) < 14 * 86400e3;
line(`\n== DECISION`);
line(`last VerdictReceived:  ${lvTime ?? "none"}  (block ${lastVerdict?.block_number})`);
line(`last DisputeRequested: ${lastDispute ? await blockTime(lastDispute.block_number) : "none"}  (block ${lastDispute?.block_number})`);
line(fresh ? "JURY LIVE: a verdict was delivered within 14 days." : "JURY NOT LIVE: no verdict delivered within 14 days. Post in the WG thread and build Fallback B.");
