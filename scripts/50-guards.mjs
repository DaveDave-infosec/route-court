// Guard transactions that MUST fail, recorded with their revert reasons.
// Each guard is first simulated against live state; only if the simulation reverts is the
// real transaction sent (with a fixed gas limit) so the failure is visible on Basescan.
//   --phase active    (case ACTIVE)    : a non-party calls raiseDispute
//   --phase disputed  (case DISPUTED)  : USER calls raiseDispute again; off-chain hash-mismatch refusal
//   --phase late      (window closed, before resolve): the losing side calls submitEvidence too late
//   node scripts/50-guards.mjs --case A --phase active|disputed|late
import fs from "node:fs";
import path from "node:path";
import { encodeFunctionData, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { EXPLORER, agreementAbi, publicClient, walletFor, readAgreement } from "../lib/court.mjs";
import { loadCase, assertEvidenceMatchesSnapshot } from "../lib/cases.mjs";

const args = process.argv.slice(2);
const caseId = args[args.indexOf("--case") + 1];
const phase = args[args.indexOf("--phase") + 1];
const c = loadCase(caseId);
const addr = c.agreement.agreement;
const user = walletFor(process.env.USER_PK);
const agent = walletFor(process.env.AGENT_PK);
const outPath = "deployments/base-sepolia/guards.json";
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const results = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : [];
const record = (r) => {
  results.push({ case: caseId, agreement: addr, at: new Date().toISOString(), ...r });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
};

async function mustRevert(name, wallet, functionName, fnArgs = []) {
  let reason;
  try {
    await publicClient.simulateContract({ account: wallet.account, address: addr, abi: agreementAbi, functionName, args: fnArgs });
  } catch (e) {
    reason = e.cause?.reason ?? e.shortMessage ?? e.message;
  }
  if (!reason) {
    console.log(`FINDING: ${name} did NOT revert in simulation; not sending it.`);
    record({ guard: name, caller: wallet.account.address, reverted: false, note: "simulation succeeded; recorded as a finding about Internet Court" });
    return;
  }
  const hash = await wallet.sendTransaction({ to: addr, data: encodeFunctionData({ abi: agreementAbi, functionName, args: fnArgs }), gas: 200000n });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${name}: ${r.status.toUpperCase()} ("${reason}")\n  ${EXPLORER}/tx/${hash}`);
  record({ guard: name, caller: wallet.account.address, reverted: r.status === "reverted", reason, tx: hash });
}

const a = await readAgreement(addr);
console.log(`case ${caseId} agreement ${addr} status ${a.statusName}`);

if (phase === "active") {
  if (a.statusName !== "ACTIVE") throw new Error("phase active needs an ACTIVE case");
  let pk = process.env.STRANGER_PK;
  if (!pk) {
    pk = generatePrivateKey();
    fs.appendFileSync(".env", `STRANGER_PK=${pk}\n`);
  }
  const stranger = walletFor(pk);
  if ((await publicClient.getBalance({ address: stranger.account.address })) < parseEther("0.0002")) {
    const h = await user.sendTransaction({ to: stranger.account.address, value: parseEther("0.0005") });
    await publicClient.waitForTransactionReceipt({ hash: h });
    console.log(`funded STRANGER ${stranger.account.address} for gas: ${EXPLORER}/tx/${h}`);
  }
  await mustRevert("1. non-party raiseDispute", stranger, "raiseDispute");
} else if (phase === "disputed") {
  if (a.statusName !== "DISPUTED") throw new Error("phase disputed needs a DISPUTED case");
  await mustRevert("2. second raiseDispute by USER", user, "raiseDispute");
  // 4. Off-chain: evidence quoting a hash that is not snapshot.json's hash is refused.
  const winner = c.dispute?.winner?.toLowerCase() ?? "user";
  const real = fs.readFileSync(path.join(c.dir, `evidence-${winner}.txt`), "utf8");
  const forged = real.replace(/^SNAPSHOT sha256: ([0-9a-f])/, (_m, ch) => `SNAPSHOT sha256: ${ch === "0" ? "1" : "0"}`);
  try {
    assertEvidenceMatchesSnapshot(c.dir, forged);
    console.log("FINDING: forged evidence was not refused");
    record({ guard: "4. off-chain hash mismatch", refused: false });
  } catch (e) {
    console.log(`4. off-chain hash mismatch: refused before sending\n  ${e.message}`);
    record({ guard: "4. off-chain hash mismatch", refused: true, message: e.message });
  }
} else if (phase === "late") {
  if (a.statusName !== "DISPUTED") throw new Error("phase late runs after the window closes but BEFORE resolve");
  const windowEnds = Number(a.disputeTimestamp) + Number(a.evidenceDeadlineSeconds);
  for (;;) {
    const left = windowEnds - Number((await publicClient.getBlock()).timestamp);
    if (left < 0) break;
    console.log(`evidence window closes in ${left}s ...`);
    await new Promise((r) => setTimeout(r, Math.min(left + 5, 60) * 1000));
  }
  const loserIsUser = c.dispute.winner === "AGENT";
  const loser = loserIsUser ? user : agent;
  const text = fs.readFileSync(path.join(c.dir, `evidence-${loserIsUser ? "user" : "agent"}.txt`), "utf8");
  await mustRevert(`3. late submitEvidence by ${loserIsUser ? "USER" : "AGENT"}`, loser, "submitEvidence", [text]);
} else {
  throw new Error("--phase active|disputed|late");
}
