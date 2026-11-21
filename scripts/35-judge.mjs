// Files a case with the Route Court judge on GenLayer and stores the verdict.
//   node scripts/35-judge.mjs --dry-run              (judges the newest dry-run snapshot)
//   node scripts/35-judge.mjs --case A|B [--agreement 0x...] [--source-url https://...]
import fs from "node:fs";
import path from "node:path";
import { buildEvidence, defaultPosition, sha256File } from "../lib/evidence.mjs";
import { statement, GUIDELINES } from "../lib/terms.mjs";
import { JUDGE_ADDRESS, judgeAccount, judgeClient } from "../lib/genlayer.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const dry = args.includes("--dry-run");

let dir;
if (dry) {
  const base = path.join("data", "dry-run");
  const runs = fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, "snapshot.json"))).sort();
  if (!runs.length) throw new Error("no dry run found; run npm run dry-run first");
  dir = path.join(base, runs.at(-1));
} else {
  const c = opt("case");
  const idx = JSON.parse(fs.readFileSync("cases/index.json", "utf8"));
  if (!idx[c]) throw new Error(`case ${c} not captured yet`);
  dir = idx[c].dir;
}

const snapPath = path.join(dir, "snapshot.json");
const sha256 = sha256File(snapPath);
const snapshot = JSON.parse(fs.readFileSync(snapPath, "utf8"));
const pinned = path.join(dir, "snapshot.sha256");
if (fs.existsSync(pinned) && !fs.readFileSync(pinned, "utf8").startsWith(sha256)) throw new Error("snapshot.json no longer matches its pinned hash; refusing");

const agreement = opt("agreement", dry ? "none (dry run)" : null);
if (!agreement) throw new Error("--agreement 0x... required for a real case");
const REPO = process.env.REPO_URL || "https://github.com/DaveDave-infosec/route-court";
const sourceUrl = opt("source-url", dry ? undefined : `${REPO}/blob/main/${dir.replace(/\\/g, "/")}/snapshot.json (sha256 above is authoritative)`);

// Evidence strings are written once and reused byte for byte on Base Sepolia.
const evFile = (p) => path.join(dir, `evidence-${p.toLowerCase()}.txt`);
const evidence = {};
for (const party of ["USER", "AGENT"]) {
  if (!fs.existsSync(evFile(party))) {
    fs.writeFileSync(evFile(party), buildEvidence({ snapshot, sha256, sourceUrl, position: defaultPosition(party, snapshot), party }));
  }
  evidence[party] = fs.readFileSync(evFile(party), "utf8");
}
const stmt = statement(snapshot.caseRef, snapshot.capturedAt);

const account = judgeAccount();
const client = judgeClient(account);
console.log(`judge ${JUDGE_ADDRESS}\nfiler ${account.address}\ncase  ${snapshot.caseRef}  (snapshot ${sha256})`);

try {
  await client.request({ method: "sim_fundAccount", params: [account.address, 100000000000000000000] });
} catch (e) {
  console.log(`(fund skipped: ${e.shortMessage || e.message})`);
}

const call = {
  account,
  address: JUDGE_ADDRESS,
  functionName: "judge",
  args: [snapshot.caseRef, agreement, sha256, stmt, GUIDELINES, evidence.USER, evidence.AGENT],
};
let fees;
try {
  const est = await client.estimateTransactionFeesForWrite(call);
  fees = { distribution: est.distribution, messageAllocations: est.messageAllocations, feeValue: est.feeValue };
} catch (e) {
  console.log(`(fee estimate skipped: ${e.shortMessage || e.message})`);
}
const hash = await client.writeContract(fees ? { ...call, fees } : call);
console.log(`judge tx ${hash}\nwaiting for FINALIZED (validators re-judge independently; this takes a few minutes)...`);
const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: "finalized", interval: 5000, retries: 120 });
console.log(`status ${receipt.statusName ?? receipt.status}  result ${receipt.resultName ?? receipt.result ?? ""}`);

const ruling = JSON.parse(await client.readContract({ address: JUDGE_ADDRESS, functionName: "get_case", args: [snapshot.caseRef] }));
if (!ruling.judged) throw new Error("tx finalized but the judge stored no verdict; inspect the tx in Studio");
const out = { contract: JUDGE_ADDRESS, chain: "GenLayer Studio Next (61997)", tx: hash, filer: account.address, ...ruling, at: new Date().toISOString() };
fs.writeFileSync(path.join(dir, "genlayer.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nVERDICT ${ruling.verdict}   (${ruling.verdict === "TRUE" ? "route broke the mandate: USER refunded" : "route complied: AGENT paid"})`);
console.log(`REASONING ${ruling.reasoning}`);
console.log(`saved ${path.join(dir, "genlayer.json")}`);
