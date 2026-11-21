import fs from "node:fs";
import path from "node:path";
import { sha256File } from "./evidence.mjs";

export function loadCase(caseId) {
  const idx = JSON.parse(fs.readFileSync("cases/index.json", "utf8"));
  const entry = idx[caseId];
  if (!entry) throw new Error(`case ${caseId} not captured`);
  const dir = entry.dir;
  const read = (f) => (fs.existsSync(path.join(dir, f)) ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : null);
  return { idx, entry, dir, snapshot: read("snapshot.json"), agreement: read("agreement.json"), genlayer: read("genlayer.json"), dispute: read("dispute.json") };
}

// Off-chain guard: refuse any evidence whose quoted hash is not the hash of snapshot.json as it sits on disk.
export function assertEvidenceMatchesSnapshot(dir, evidence) {
  const actual = sha256File(path.join(dir, "snapshot.json"));
  const m = evidence.match(/^SNAPSHOT sha256: ([0-9a-f]{64})/);
  if (!m) throw new Error("REFUSED: evidence does not start with a snapshot hash");
  if (m[1] !== actual) throw new Error(`REFUSED: evidence quotes ${m[1]} but snapshot.json hashes to ${actual}`);
  return actual;
}

export const save = (dir, file, obj) => fs.writeFileSync(path.join(dir, file), JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
