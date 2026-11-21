---
name: lifi-route-court
description: Hold an agent accountable for the LI.FI route it picks on someone else's behalf. Captures and hashes the live route list, escrows the agent fee in an Internet Court agreement on Base Sepolia, and submits court-ready evidence on dispute.
---

# LI.FI Route Court

## When to use

An agent is about to move funds through LI.FI for someone else, under a written mandate, for a fee.
Use this skill so the route choice can be checked later against the routes that really existed, and so the fee only reaches the agent if the choice honoured the mandate.

Reference implementation: the `route-court` repository. Each step below names the script that does it.

## Three levels

1. **No wallet:** `npm run dry-run -- --mode faithful` captures live routes, computes facts, picks, hashes the snapshot and prints the evidence string.
2. **No keys:** `npm run verify -- --case A` re-checks a finished case on Base Sepolia and GenLayer.
3. **Own wallet:** `npm run demo -- --case A` runs the whole flow.

## Steps

1. **Capture** (`lib/lifi.mjs`): `POST https://li.quest/v1/advanced/routes` with the exact request. Keep the raw response bytes.
2. **Compute facts** (`lib/facts.mjs`): per route, USDC delivered, gas, fees with `included: false` (charged on top of the quote), net received, time (sum of included step estimates), hops (excluding LI.FI's `feeCollection` step), within the mandate's time limit.
3. **Pick** (`scripts/10-agent-pick.mjs`): apply the agent's policy and record `chosenVsBest` against the best in-time route.
4. **Freeze**: write `snapshot.json` (request, raw response, mandate, facts, choice) and its sha256 over the bytes as written. Commit it.
5. **Open the agreement** (`scripts/20-open-case.mjs`): user approves the **factory** for the fee, calls `createAgreement` with the agent as party B, the agent calls `acceptAgreement`. Read the state back.
6. **Happy path:** no dispute. The parties call `proposeOutcome(false)` and `confirmOutcome()`; the agent claims the fee.
7. **Dispute** (`scripts/30-dispute.mjs`): user calls `raiseDispute`; GenLayer judges the same statement, guidelines and evidence; evidence is submitted on the agreement.
8. **Settle** (`scripts/40-resolve.mjs`): after the evidence window, `resolveByDefault` (relay down) or the bridge verdict (relay up); the winner calls `claimFunds`.

## Agreement parameters

| Param | Value |
|---|---|
| partyA (caller) | the user (funds the fee) |
| partyB | the agent |
| `_statement` | "The route the agent committed to for transfer {caseRef} broke the user's mandate, given the routes LI.FI offered at {capturedAt}." |
| `_guidelines` | the mandate verbatim + "Judge only the evidence package. Cost, time and hop facts are computed by code from a frozen, sha256-hashed snapshot; treat them as correct. TRUE means the route broke the mandate." |
| `_evidenceDefs` | "User: why the route broke the mandate. Agent: why it complied. Both must quote the snapshot sha256." |
| `_evidenceDeadlineSeconds` | 900 |
| `_usdcToken` / `_escrowAmount` | MockUSDC `0x58C27C7C1Ff5DBF480c956acf6b119508b6FBa4f`, 6 decimals |
| `_joinDeadline` | now + 1 hour |
| `_maxEvidenceLength` | 4000 |

## Statement wording rule

Internet Court pays **party A on TRUE_** and **party B on FALSE_**. With the user as party A, word the statement as a **breach**, so TRUE_ refunds the user and FALSE_ pays the agent.

## Evidence template

```
SNAPSHOT sha256: <hash>
SOURCE: <repo URL of snapshot.json>
MANDATE: <verbatim>
TRANSFER: <amount, chains, capture time>
NET = USDC delivered minus gas minus fees paid on top of the quote. Time = LI.FI estimate.
ROUTES OFFERED (top 5 by net received, of N):
1. <tools> | net $x | s | hops | paid on top $y | in time / TOO SLOW | tags
AGENT CHOSE: <route line>
BEST IN-TIME ROUTE: <route line>
CHOSEN VS BEST: $d (p%) less received, <faster/slower>, <hops>.
GENLAYER RULING: <verdict, judge contract, tx, reasoning>   (relay-down mode only)
POSITION (<party>): <argument>
```

The jury must be able to rule from this string alone. Refuse to submit any evidence whose quoted hash does not match `snapshot.json` (`lib/cases.mjs`).

## Honest limits

- Internet Court's GenLayer relay has delivered no verdict on Base Sepolia since 2026-03-19. Until it returns, the judge is `contracts/route_judge.py` on GenLayer Studio Next, and the parties carry its verdict: only the favoured side submits evidence, then `resolveByDefault`.
- **Never let both sides submit evidence while the relay is down.** The agreement moves to RESOLVING and only the bridge can release the escrow.
- LI.FI has no testnet. Route data is real mainnet data; the transfer is not executed in the demo.
- Times are LI.FI estimates, not measured arrivals.
