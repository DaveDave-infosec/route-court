// The words both courts see. Internet Court pays party A (USER) on TRUE_ and
// party B (AGENT) on FALSE_, so the statement is worded as a breach:
// TRUE = the route broke the mandate = user refunded.
import { MANDATE } from "./facts.mjs";

export const statement = (caseRef, capturedAt) =>
  `The route the agent committed to for transfer ${caseRef} broke the user's mandate, given the routes LI.FI offered at ${capturedAt}.`;

export const GUIDELINES = `MANDATE (verbatim): "${MANDATE}" Judge only the evidence package. Cost, time and hop facts are computed by code from a frozen, sha256-hashed snapshot of the routes LI.FI offered; treat them as correct. Rule on whether the agent's trade-off honours the mandate's wording ("cheapest sensible", "do not overpay for speed", "real money"). TRUE means the route broke the mandate.`;

export const EVIDENCE_DEFS = "User: why the route broke the mandate. Agent: why it complied. Both must quote the snapshot sha256.";

export const CONSTRAINTS = "Route Court demo. Route data is real LI.FI mainnet data; the transfer is not executed. Both wallets are demo wallets controlled by the builder.";
