// Logs ONE raw /advanced/routes response so facts.mjs maps real fields, not memory.
import fs from "node:fs";
import { fetchRoutes, DEMO_REQUEST } from "../lib/lifi.mjs";

const capturedAt = new Date().toISOString();
const { text, json, rateLimit } = await fetchRoutes(DEMO_REQUEST);
fs.mkdirSync("discovery", { recursive: true });
fs.writeFileSync("discovery/lifi-raw.json", text);
fs.writeFileSync("discovery/lifi-request.json", JSON.stringify({ capturedAt, request: DEMO_REQUEST }, null, 2));

const routes = json.routes ?? [];
console.log(`captured ${capturedAt}   routes: ${routes.length}   rate limit: ${rateLimit.remaining}/${rateLimit.limit}`);
console.log(`top-level keys: ${Object.keys(json).join(", ")}`);
if (routes[0]) {
  console.log(`route keys:  ${Object.keys(routes[0]).join(", ")}`);
  const s = routes[0].steps?.[0];
  if (s) {
    console.log(`step keys:   ${Object.keys(s).join(", ")}`);
    console.log(`estimate keys: ${Object.keys(s.estimate ?? {}).join(", ")}`);
    console.log(`includedSteps: ${s.includedSteps ? s.includedSteps.length : "none"}`);
  }
}
console.log("\n#  tags                     tools                          steps  toAmountUSD  gasUSD   durS");
routes.forEach((r, i) => {
  const tools = (r.steps ?? []).flatMap((s) => (s.includedSteps?.length ? s.includedSteps : [s]).map((x) => x.toolDetails?.name ?? x.tool)).join(" > ");
  const dur = (r.steps ?? []).reduce((a, s) => a + Number(s.estimate?.executionDuration ?? 0), 0);
  const inner = (r.steps ?? []).reduce((a, s) => a + (s.includedSteps?.length || 1), 0);
  console.log(
    `${String(i + 1).padEnd(3)}${String((r.tags ?? []).join(",")).padEnd(25)}${tools.slice(0, 30).padEnd(31)}${String(r.steps?.length) + "/" + inner}`.padEnd(66) +
      `${String(r.toAmountUSD).padEnd(13)}${String(r.gasCostUSD).padEnd(9)}${dur}`
  );
});
console.log("\nraw response saved to discovery/lifi-raw.json");
