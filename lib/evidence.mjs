import crypto from "node:crypto";
import fs from "node:fs";

export const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
export const sha256File = (path) => sha256Hex(fs.readFileSync(path));

const usd = (x) => `$${x.toFixed(4)}`;
const hopsText = (n) => (n === 0 ? "same number of hops" : `${Math.abs(n)} ${n > 0 ? "more" : "fewer"} hop${Math.abs(n) === 1 ? "" : "s"}`);
function routeLine(f) {
  const tags = f.tags.length ? f.tags.join(",") : "-";
  return `${f.tools.join(" > ")} | net ${usd(f.netReceivedUSD)} | ${f.durationSec}s | ${f.hops} hop${f.hops === 1 ? "" : "s"} | paid on top ${usd(f.onTopFeesUSD)} | ${f.withinTime ? "in time" : "TOO SLOW"} | ${tags}`;
}

// The on-chain evidence string. The jury must be able to rule from this alone.
export function buildEvidence({ snapshot, sha256, sourceUrl, position, party, genlayer }) {
  const { facts, chosenRouteId, chosenVsBest: d, mandate, capturedAt, request } = snapshot;
  const chosen = facts.find((f) => f.id === chosenRouteId);
  const best = facts.find((f) => f.id === d.bestRouteId);
  const top = [...facts].sort((a, b) => b.netReceivedUSD - a.netReceivedUSD).slice(0, 5);
  const speed = d.durationDiffSec > 0 ? `${d.durationDiffSec}s faster` : d.durationDiffSec < 0 ? `${-d.durationDiffSec}s slower` : "same time";
  const lines = [
    `SNAPSHOT sha256: ${sha256}`,
    `SOURCE: ${sourceUrl ?? "(commit-pinned URL added after commit)"}`,
    `MANDATE: ${mandate}`,
    `TRANSFER: ${Number(request.fromAmount) / 1e6} USDC, chain ${request.fromChainId} (Base) to ${request.toChainId} (Arbitrum). Routes captured from LI.FI at ${capturedAt}.`,
    `NET = USDC delivered minus gas minus fees paid on top of the quote (USDC valued at $1). Time = LI.FI estimate.`,
    `ROUTES OFFERED (top 5 by net received, of ${facts.length}):`,
    ...top.map((f, i) => `${i + 1}. ${routeLine(f)}`),
    `AGENT CHOSE: ${routeLine(chosen)}`,
    `BEST IN-TIME ROUTE: ${routeLine(best)}`,
    `CHOSEN VS BEST: ${usd(d.netDiffUSD)} (${d.netDiffPct.toFixed(4)}%) less received, ${speed}, ${hopsText(d.stepDiff)}.`,
  ];
  if (genlayer) lines.push(`GENLAYER RULING: contract ${genlayer.contract}, tx ${genlayer.tx}, verdict ${genlayer.verdict}`);
  lines.push(`POSITION (${party}): ${position}`);
  return lines.join("\n");
}

// Each side's argument, written from the computed facts.
export function defaultPosition(party, snapshot) {
  const { facts, chosenRouteId, chosenVsBest: d } = snapshot;
  const c = facts.find((f) => f.id === chosenRouteId);
  const b = facts.find((f) => f.id === d.bestRouteId);
  if (party === "USER") {
    if (d.netDiffUSD <= 0)
      return `The agent chose ${c.tools.join(" > ")}. I accept it matched the best in-time route on net received; I raise this dispute to have the choice checked.`;
    return `The mandate asked for the cheapest sensible route that arrives within 10 minutes, without overpaying for speed. ${b.tools.join(" > ")} was available, in time, and delivered ${d.netDiffUSD.toFixed(4)} USD more. The agent chose ${c.tools.join(" > ")}${c.onTopFeesUSD > 0 ? `, which also charges ${c.onTopFeesUSD.toFixed(4)} USD on top of the quote` : ""}${d.durationDiffSec < 0 ? ` and is ${-d.durationDiffSec}s slower` : ""}. That is not the cheapest sensible route.`;
  }
  if (d.netDiffUSD <= 0)
    return `I chose ${c.tools.join(" > ")}: in time (${c.durationSec}s), single hop, and the highest net received of all in-time routes. That is the cheapest sensible route the mandate asked for.`;
  return `I chose ${c.tools.join(" > ")}: it arrives in ${c.durationSec}s, well inside 10 minutes, as a single hop through an established bridge. The difference to ${b.tools.join(" > ")} is ${d.netDiffUSD.toFixed(4)} USD (${d.netDiffPct.toFixed(4)}%) on ${c.sentUSDC} USDC, which I consider within a sensible margin.`;
}
