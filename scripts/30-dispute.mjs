// Dispute path while Internet Court's jury relay is down (Fallback B):
//  1. USER raises the dispute on the Internet Court agreement (Base Sepolia).
//  2. The GenLayer judge rules on the same statement, guidelines and evidence.
//  3. Only the side the GenLayer verdict favours submits its evidence on the agreement,
//     quoting the GenLayer contract, tx and reasoning. (Both submitting would move the
//     agreement to RESOLVING, which only the dead relay can exit.)
//  Then run 40-resolve after the evidence window to settle by resolveByDefault.
//   node scripts/30-dispute.mjs --case A|B
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { agreementAbi, publicClient, walletFor, sendAndLog, readAgreement } from "../lib/court.mjs";
import { loadCase, assertEvidenceMatchesSnapshot, save } from "../lib/cases.mjs";

const caseId = process.argv[process.argv.indexOf("--case") + 1];
let c = loadCase(caseId);
if (!c.agreement) throw new Error(`case ${caseId} has no agreement; run open-case first`);
const addr = c.agreement.agreement;
const user = walletFor(process.env.USER_PK);
const agent = walletFor(process.env.AGENT_PK);

// 1. Raise the dispute.
let a = await readAgreement(addr);
if (a.statusName === "ACTIVE") {
  await sendAndLog(`raiseDispute case ${caseId} (USER)`, user, { address: addr, abi: agreementAbi, functionName: "raiseDispute" });
  a = await readAgreement(addr);
}
if (a.statusName !== "DISPUTED") throw new Error(`expected DISPUTED, got ${a.statusName}`);
const windowEnds = Number(a.disputeTimestamp) + Number(a.evidenceDeadlineSeconds);
console.log(`DISPUTED by ${a.disputeInitiator}; evidence window closes ${new Date(windowEnds * 1000).toISOString()}`);

// 2. GenLayer judges (skipped if already judged).
if (!c.genlayer) {
  execFileSync(process.execPath, ["scripts/35-judge.mjs", "--case", caseId, "--agreement", addr], { stdio: "inherit", env: process.env });
  c = loadCase(caseId);
}
const g = c.genlayer;
if (!g?.judged) throw new Error("no GenLayer verdict");
if (Date.now() / 1000 > windowEnds - 30) throw new Error("evidence window (nearly) closed before the verdict; do not submit");

// 3. Winner submits evidence with the GenLayer ruling attached.
const winner = g.verdict === "TRUE" ? "USER" : "AGENT";
const base = fs.readFileSync(path.join(c.dir, `evidence-${winner.toLowerCase()}.txt`), "utf8");
const ruling = `GENLAYER RULING: verdict ${g.verdict} (${g.verdict === "TRUE" ? "route broke the mandate" : "route complied"}) by Route Court judge ${g.contract} on ${g.chain}, tx ${g.tx}. Reasoning: ${g.reasoning}`;
const evidence = `${base}\n${ruling}`;
if (evidence.length > Number((await publicClient.readContract({ address: addr, abi: agreementAbi, functionName: "maxEvidenceLength" })))) throw new Error(`evidence ${evidence.length} chars exceeds maxEvidenceLength`);
assertEvidenceMatchesSnapshot(c.dir, evidence); // off-chain guard
fs.writeFileSync(path.join(c.dir, `onchain-evidence-${winner.toLowerCase()}.txt`), evidence);

const wallet = winner === "USER" ? user : agent;
const already = winner === "USER" ? a.evidenceASubmitted : a.evidenceBSubmitted;
let evidenceTx = c.dispute?.evidenceTx;
if (!already) {
  const r = await sendAndLog(`submitEvidence case ${caseId} (${winner}, ${evidence.length} chars)`, wallet, { address: addr, abi: agreementAbi, functionName: "submitEvidence", args: [evidence] });
  evidenceTx = r.transactionHash;
}
a = await readAgreement(addr);
console.log(`evidence submitted: USER ${a.evidenceASubmitted}  AGENT ${a.evidenceBSubmitted}  status ${a.statusName}`);
if (a.evidenceASubmitted && a.evidenceBSubmitted) throw new Error("both sides submitted: agreement will wait on the relay");

save(c.dir, "dispute.json", { agreement: addr, initiator: a.disputeInitiator, disputeTimestamp: a.disputeTimestamp, windowEnds, genlayerVerdict: g.verdict, winner, evidenceTx, evidenceChars: evidence.length });
console.log(`\nnext: after ${new Date(windowEnds * 1000).toISOString()} run  npm run resolve -- --case ${caseId}`);
