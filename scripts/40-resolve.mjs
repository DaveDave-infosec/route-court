// After the evidence window: resolveByDefault (only submitter wins), winner claims, balances before/after.
//   node scripts/40-resolve.mjs --case A|B      (waits for the window if it is still open)
import { formatUnits } from "viem";
import { ADDR, agreementAbi, erc20Abi, publicClient, walletFor, sendAndLog, readAgreement } from "../lib/court.mjs";
import { loadCase, save } from "../lib/cases.mjs";

const caseId = process.argv[process.argv.indexOf("--case") + 1];
const c = loadCase(caseId);
if (!c.dispute) throw new Error("run dispute first");
const addr = c.agreement.agreement;
const user = walletFor(process.env.USER_PK);
const agent = walletFor(process.env.AGENT_PK);
const bal = async () => {
  const [u, g, e] = await Promise.all([user.account.address, agent.account.address, addr].map((x) => publicClient.readContract({ address: ADDR.mockUSDC, abi: erc20Abi, functionName: "balanceOf", args: [x] })));
  return { USER: formatUnits(u, 6), AGENT: formatUnits(g, 6), escrow: formatUnits(e, 6) };
};

let a = await readAgreement(addr);
const before = await bal();
console.log(`before: USER ${before.USER}  AGENT ${before.AGENT}  agreement escrow ${before.escrow} MockUSDC   status ${a.statusName}`);

if (a.statusName === "DISPUTED") {
  for (;;) {
    const now = Number((await publicClient.getBlock()).timestamp);
    const left = c.dispute.windowEnds - now;
    if (left < 0) break;
    console.log(`evidence window closes in ${left}s ...`);
    await new Promise((r) => setTimeout(r, Math.min(left + 5, 60) * 1000));
  }
  await sendAndLog(`resolveByDefault case ${caseId}`, user, { address: addr, abi: agreementAbi, functionName: "resolveByDefault" });
  a = await readAgreement(addr);
}
console.log(`status ${a.statusName}  verdict ${a.verdictName}\nreasoning: ${a.reasoning}`);
const winnerWallet = a.verdictName === "TRUE_" ? user : agent;
const pending = await publicClient.readContract({ address: addr, abi: agreementAbi, functionName: "pendingWithdrawals", args: [winnerWallet.account.address] });
let claimTx;
if (pending > 0n) {
  const r = await sendAndLog(`claimFunds case ${caseId} (${a.verdictName === "TRUE_" ? "USER" : "AGENT"})`, winnerWallet, { address: addr, abi: agreementAbi, functionName: "claimFunds" });
  claimTx = r.transactionHash;
}
const after = await bal();
console.log(`after:  USER ${after.USER}  AGENT ${after.AGENT}  agreement escrow ${after.escrow} MockUSDC`);
const match = (a.verdictName === "TRUE_") === (c.genlayer.verdict === "TRUE");
console.log(`Internet Court verdict ${a.verdictName} ${match ? "matches" : "DOES NOT MATCH"} GenLayer verdict ${c.genlayer.verdict}`);
save(c.dir, "resolution.json", { status: a.statusName, verdict: a.verdictName, reasoning: a.reasoning, genlayerVerdict: c.genlayer.verdict, match, claimTx, balancesBefore: before, balancesAfter: after });
