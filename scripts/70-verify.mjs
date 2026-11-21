// Level 2: anyone can check our cases are real and untampered. No keys needed.
//   node scripts/70-verify.mjs --case A|B
import fs from "node:fs";
import { createClient } from "genlayer-js";
import { readAgreement, publicClient, agreementAbi } from "../lib/court.mjs";
import { studioNext } from "../lib/genlayer.mjs";
import { sha256File } from "../lib/evidence.mjs";

const caseId = process.argv[process.argv.indexOf("--case") + 1];
const m = JSON.parse(fs.readFileSync("deployments/base-sepolia/manifest.json", "utf8"));
const c = m.cases[caseId];
if (!c) throw new Error(`case ${caseId} not in manifest`);
let ok = true;
const check = (label, pass, detail = "") => {
  ok &&= pass;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
};

const addr = c.internetCourt.agreement;
console.log(`case ${caseId} (${c.caseRef})  agreement ${addr}`);
const a = await readAgreement(addr);
console.log(`on-chain: status ${a.statusName}  verdict ${a.verdictName}  reasoning "${a.reasoning}"`);
check("agreement is RESOLVED", a.statusName === "RESOLVED");

const localHash = sha256File(c.snapshot.path);
check("committed snapshot.json hashes to the manifest hash", localHash === c.snapshot.sha256, localHash);
const evidence = await publicClient.readContract({ address: addr, abi: agreementAbi, functionName: a.evidenceASubmitted ? "evidenceA" : "evidenceB" });
const quoted = evidence.match(/^SNAPSHOT sha256: ([0-9a-f]{64})/)?.[1];
check("on-chain evidence quotes that same hash", quoted === localHash, `(${a.evidenceASubmitted ? "USER" : "AGENT"} evidence, ${evidence.length} chars)`);
check("statement on-chain names this case", a.statement.includes(c.caseRef));

const gl = createClient({ chain: studioNext });
const g = JSON.parse(await gl.readContract({ address: c.genlayer.judge, functionName: "get_case", args: [c.caseRef] }));
console.log(`GenLayer judge: verdict ${g.verdict}  "${g.reasoning}"`);
check("GenLayer judge stored the same snapshot hash", g.snapshot_sha256 === localHash);
check("GenLayer judge points at this agreement", g.agreement === addr.toLowerCase());
check("Internet Court verdict matches GenLayer verdict", (a.verdictName === "TRUE_") === (g.verdict === "TRUE"));
check("on-chain evidence quotes the GenLayer tx", evidence.includes(c.genlayer.tx));
console.log(ok ? "\nVERIFIED" : "\nNOT VERIFIED");
process.exitCode = ok ? 0 : 1;
