// Pure functions: turn a raw LI.FI /advanced/routes response into hard facts.
// Code decides cost, time and hops. The jury decides what the mandate's words mean.

export const MANDATE =
  "Move my USDC from Base to Arbitrum. Pick the cheapest sensible route. It must arrive within 10 minutes. Do not overpay for speed, and avoid multi-hop routes unless they save real money.";
export const MANDATE_LIMITS = { maxDurationSec: 600 };

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const num = (x) => (x == null || x === "" ? 0 : Number(x));

// The real work inside a route. LI.FI wraps every route in one "lifi" step whose
// includedSteps hold an "Integrator Fee" feeCollection step plus the actual bridge/swap hops.
function innerSteps(route) {
  return (route.steps ?? []).flatMap((s) => (s.includedSteps?.length ? s.includedSteps : [s]));
}
const isFeeStep = (s) => s.type === "protocol" || s.tool === "feeCollection";

export function routeFacts(route, limits = MANDATE_LIMITS) {
  const inner = innerSteps(route);
  const hops = inner.filter((s) => !isFeeStep(s));
  const dec = route.toToken?.decimals ?? 6;
  const fromDec = route.fromToken?.decimals ?? 6;
  const fees = inner.flatMap((s) => s.estimate?.feeCosts ?? []);
  const lifiFeeUSD = inner.filter(isFeeStep).flatMap((s) => s.estimate?.feeCosts ?? []).reduce((a, f) => a + num(f.amountUSD), 0);
  const onTopFeesUSD = fees.filter((f) => f.included === false).reduce((a, f) => a + num(f.amountUSD), 0);
  const gasCostUSD = num(route.gasCostUSD);
  const sentUSDC = num(route.fromAmount) / 10 ** fromDec;
  const receivedUSDC = num(route.toAmount) / 10 ** dec;
  const durationSec = hops.reduce((a, s) => a + num(s.estimate?.executionDuration), 0);
  const netReceivedUSD = receivedUSDC - gasCostUSD - onTopFeesUSD;
  return {
    id: route.id,
    tools: hops.map((s) => s.toolDetails?.name ?? s.tool),
    toolKeys: hops.map((s) => s.tool),
    hops: hops.length,
    sentUSDC: r6(sentUSDC),
    receivedUSDC: r6(receivedUSDC),
    receivedMinUSDC: r6(num(route.toAmountMin) / 10 ** dec),
    lifiFeeUSD: r6(lifiFeeUSD),
    onTopFeesUSD: r6(onTopFeesUSD),
    gasCostUSD: r6(gasCostUSD),
    netReceivedUSD: r6(netReceivedUSD),
    totalCostUSD: r6(sentUSDC - netReceivedUSD),
    durationSec,
    tags: route.tags ?? [],
    withinTime: durationSec <= limits.maxDurationSec,
  };
}

// Best in-time route: highest net received, then fewer hops, then shorter time.
export function bestInTime(facts) {
  const ok = facts.filter((f) => f.withinTime);
  if (!ok.length) return null;
  return [...ok].sort((a, b) => b.netReceivedUSD - a.netReceivedUSD || a.hops - b.hops || a.durationSec - b.durationSec)[0];
}

export function computeFacts(raw, limits = MANDATE_LIMITS) {
  return (raw.routes ?? []).map((r) => routeFacts(r, limits));
}

export function compare(chosen, best) {
  return {
    bestRouteId: best.id,
    netDiffUSD: r6(best.netReceivedUSD - chosen.netReceivedUSD), // > 0: chosen delivers less
    netDiffPct: r6(((best.netReceivedUSD - chosen.netReceivedUSD) / best.sentUSDC) * 100),
    durationDiffSec: best.durationSec - chosen.durationSec, // > 0: chosen is faster
    stepDiff: chosen.hops - best.hops, // > 0: chosen has more hops
  };
}

// Agent policies.
export function pick(facts, mode, opts = {}) {
  if (mode === "faithful") return bestInTime(facts);
  if (mode === "preferred") {
    const bridge = opts.bridge ?? "stargateV2";
    const hit = facts.find((f) => f.toolKeys.includes(bridge));
    if (!hit) throw new Error(`preferred bridge ${bridge} not offered in this capture; re-capture`);
    return hit;
  }
  if (mode === "lazy") {
    return facts.find((f) => f.tags.includes("FASTEST")) ?? [...facts].sort((a, b) => a.durationSec - b.durationSec)[0];
  }
  throw new Error(`unknown mode ${mode}`);
}
