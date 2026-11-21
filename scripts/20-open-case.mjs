// Opens a real Internet Court agreement for a captured case:
// USER approves the factory, creates the agreement (fee pulled into escrow), AGENT accepts.
//   node scripts/20-open-case.mjs --case A|B
import fs from "node:fs";
import path from "node:path";
import { parseUnits, formatUnits, parseEventLogs } from "viem";
import { ADDR, EXPLORER, factoryAbi, agreementAbi, erc20Abi, publicClient, walletFor, sendAndLog, readAgreement, jsonSafe } from "../lib/court.mjs";
import { statement, GUIDELINES, EVIDENCE_DEFS, CONSTRAINTS } from "../lib/terms.mjs";

export const TERMS = {
  escrowUSDC: "5",
  evidenceDeadlineSeconds: 900n, // GenLayer judging fits inside this window with room to spare
  maxEvidenceLength: 4000n,
  joinWindowSeconds: 3600n,
};

const args = process.argv.slice(2);
const caseId = args[args.indexOf("--case") + 1];
const idx = JSON.parse(fs.readFileSync("cases/index.json", "utf8"));
const entry = idx[caseId];
if (!entry) throw new Error(`case ${caseId} not captured; run: npm run pick -- --case ${caseId} --mode ...`);
if (entry.agreement) throw new Error(`case ${caseId} already has agreement ${entry.agreement}`);
const snapshot = JSON.parse(fs.readFileSync(path.join(entry.dir, "snapshot.json"), "utf8"));

const user = walletFor(process.env.USER_PK);
const agent = walletFor(process.env.AGENT_PK);
const escrow = parseUnits(TERMS.escrowUSDC, 6);
const stmt = statement(snapshot.caseRef, snapshot.capturedAt);

// 1. USER approves the factory (the factory pulls the escrow with transferFrom).
const allowance = await publicClient.readContract({ address: ADDR.mockUSDC, abi: erc20Abi, functionName: "allowance", args: [user.account.address, ADDR.factory] });
if (allowance < escrow) {
  await sendAndLog(`approve factory ${TERMS.escrowUSDC} MockUSDC`, user, { address: ADDR.mockUSDC, abi: erc20Abi, functionName: "approve", args: [ADDR.factory, escrow] });
}

// 2. USER creates the agreement with AGENT as party B.
const block = await publicClient.getBlock();
const joinDeadline = block.timestamp + TERMS.joinWindowSeconds;
const receipt = await sendAndLog(`createAgreement case ${caseId}`, user, {
  address: ADDR.factory,
  abi: factoryAbi,
  functionName: "createAgreement",
  args: [agent.account.address, stmt, GUIDELINES, EVIDENCE_DEFS, TERMS.evidenceDeadlineSeconds, ADDR.mockUSDC, escrow, joinDeadline, TERMS.maxEvidenceLength, CONSTRAINTS],
});
const created = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: "AgreementCreated" })[0];
if (!created) throw new Error("no AgreementCreated event in receipt");
const agreement = created.args.agreementAddress;
console.log(`agreement #${created.args.id}: ${agreement}\n  ${EXPLORER}/address/${agreement}`);

// 3. AGENT accepts.
await sendAndLog(`acceptAgreement case ${caseId}`, agent, { address: agreement, abi: agreementAbi, functionName: "acceptAgreement" });

// 4. Read back, never trust a receipt alone.
const a = await readAgreement(agreement);
const held = await publicClient.readContract({ address: ADDR.mockUSDC, abi: erc20Abi, functionName: "balanceOf", args: [agreement] });
console.log(`status ${a.statusName}  partyA ${a.partyA}  partyB ${a.partyB}  escrow ${formatUnits(a.escrowAmount, 6)} (held ${formatUnits(held, 6)} MockUSDC)`);
console.log(`statement: ${a.statement}`);
if (a.statusName !== "ACTIVE") throw new Error("agreement is not ACTIVE");
if (a.partyA.toLowerCase() !== user.account.address.toLowerCase() || a.partyB.toLowerCase() !== agent.account.address.toLowerCase()) throw new Error("party mismatch");

const record = { agreement, id: Number(created.args.id), createTx: receipt.transactionHash, terms: { ...TERMS, joinDeadline: joinDeadline.toString() }, statement: stmt, readBack: a };
fs.writeFileSync(path.join(entry.dir, "agreement.json"), JSON.stringify(record, jsonSafe, 2) + "\n");
idx[caseId].agreement = agreement;
fs.writeFileSync("cases/index.json", JSON.stringify(idx, null, 2) + "\n");
console.log(`saved ${path.join(entry.dir, "agreement.json")}`);
