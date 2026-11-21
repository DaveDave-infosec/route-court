# Route Court

**Your agent picked a route. Was it the one you asked for?**

Route Court holds an AI agent accountable for the LI.FI route it picks when it moves someone else's money.
The agent's fee sits in a real **Internet Court** agreement on Base Sepolia.
If the user disputes the choice, the **GenLayer** jury judges it against a frozen, hashed snapshot of the routes **LI.FI** actually offered at that moment.
The verdict decides who gets the fee.

**Website:** https://route-court.vercel.app (the two cases, the route exhibit and every link, generated from the committed manifest)

LI.FI x Internet Court x GenLayer. Builders Working Group mission: "Internet Court: Partner Demo Lab".

---

## The job and the dispute

A user pays an agent a 5 USDC fee to move 1,000 USDC from Base to Arbitrum under a plain-English mandate:

> "Move my USDC from Base to Arbitrum. Pick the cheapest sensible route. It must arrive within 10 minutes. Do not overpay for speed, and avoid multi-hop routes unless they save real money."

The agent asks LI.FI for every route (`POST /advanced/routes`), commits to one, and the full response is frozen into `snapshot.json` with its sha256.

- **Code decides the hard facts** for every route: USDC delivered, gas, fees charged on top of the quote, net received, estimated time, hops, and whether it fits the 10 minute limit (`lib/facts.mjs`, unit tested on a real LI.FI response).
- **The GenLayer jury decides the soft part**: whether the trade-off honours "cheapest sensible", "overpay for speed" and "real money". Code cannot decide those words.

The happy path never waits: with no dispute, the parties confirm the outcome and the agent is paid. GenLayer only runs on a dispute.

---

## The two real cases

| | Case A: faithful agent | Case B: preferred-bridge agent |
|---|---|---|
| Agent policy | Best net received among routes that arrive in 10 minutes | Always uses its hardcoded bridge (StargateV2) |
| Route chosen | LI.FI Intents, 6 s, net $997.40 | StargateV2, 27 s, net $995.55, $1.34 LayerZero fee charged on top of the quote |
| Best in-time route | the same route | LI.FI Intents > Smart Deposits, 6 s, net $997.41 |
| Gap | $0.00 | $1.86 (0.186%) less, 21 s slower |
| GenLayer verdict | **FALSE**: route complied | **TRUE**: route broke the mandate |
| Internet Court agreement | [#21 `0x8434…BEF3`](https://sepolia.basescan.org/address/0x8434312A8A8A048897Bb59Da57838AD1cafcBEF3) | [#22 `0xac99…12Ba`](https://sepolia.basescan.org/address/0xac99D4E1f4c23ee96bEBd30D0488734049Fb12Ba) |
| Internet Court verdict | FALSE_ | TRUE_ |
| 5 USDC fee went to | AGENT ([claim](https://sepolia.basescan.org/tx/0xce901e55790baab3d9afaa0f691fd9c33e4ab939a3e9e63d71e3734f32c8ae63)) | USER, refunded ([claim](https://sepolia.basescan.org/tx/0xbb0e6e79ef08dfa92b8da183430401cb95a56453f41e7a8321187835a22a2ff3)) |
| Snapshot sha256 | `539e868b…3f442eb8` | `5b9b9ef6…f60dd6ea` |

**What the jury said in Case B** (stored on the GenLayer judge):

> StargateV2 met the 10-minute limit, but AcrossV4 was also a single-hop route, arrived in 1 second rather than 27 seconds, and delivered $1.8417 more. Avoiding the two-hop LI.FI route could be sensible because it saved only $0.0173 over AcrossV4, but that does not justify choosing StargateV2 over the cheaper, faster single-hop alternative.

The jury applied the multi-hop clause on its own: it accepted that skipping a two-hop route to save under two cents is sensible, and still found the agent's pick indefensible. That is the judgment code cannot make.

**A finding worth knowing:** in every capture, the route LI.FI tags `RECOMMENDED, CHEAPEST` (Polymer Standard) takes 18 minutes. An agent that blindly follows LI.FI's own label breaks the 10 minute rule. The faithful agent skips it.

Every transaction, verdict, reasoning and balance is in [`deployments/base-sepolia/manifest.json`](deployments/base-sepolia/manifest.json).

---

## Where the money sits and how the verdict lands

| Step | Who | Where |
|---|---|---|
| Approve the factory, `createAgreement` (fee pulled into escrow) | USER (party A) | Internet Court factory `0xd533…9Dda`, Base Sepolia |
| `acceptAgreement` | AGENT (party B) | the agreement |
| `raiseDispute` | USER | the agreement |
| `judge(...)`: every validator re-judges independently | anyone | Route Court judge on GenLayer Studio Next |
| `submitEvidence` (quotes the snapshot hash and the GenLayer tx) | only the side GenLayer ruled for | the agreement |
| `resolveByDefault` after the evidence window, then `claimFunds` | anyone, then the winner | the agreement |

Internet Court pays **party A on TRUE_** and **party B on FALSE_**, so the statement is worded as a breach: *"The route the agent committed to for transfer {caseRef} broke the user's mandate, given the routes LI.FI offered at {time}."* TRUE means the user is refunded.

### Why the GenLayer judge is our own contract (Fallback B)

Internet Court's GenLayer relay has not delivered a verdict on Base Sepolia since **2026-03-19** (factory block 39068666). A dispute from 2026-11-09 is still unanswered after 11 days. Full read-only discovery is in [`discovery/GATE0.md`](discovery/GATE0.md). Another Working Group builder confirmed his x402 x GenLayer build also does not use a shared relay.

So the jury is [`contracts/route_judge.py`](contracts/route_judge.py) (GenVM v0.4), deployed on GenLayer Studio Next at `0xf20126D9bdD345069E0C65B66811E05A22480686`:

- It receives the same statement, guidelines and two evidence strings the agreement holds.
- The leader rules, and **every validator independently re-judges** the case; consensus forms only if the TRUE/FALSE verdicts match (custom validator through `vm.run_nondet`, not a format check).
- It refuses evidence that does not quote the snapshot hash, and refuses to judge a case twice.
- It stores verdict, reasoning, snapshot hash and agreement address, so both chains point at each other.

GenLayer jury txs: Case A `0x17490da7…d17aae9`, Case B `0x62dd6b31…c69a341`.

**Important finding for other builders:** once both parties submit evidence, an Internet Court agreement moves to RESOLVING, and the only exit is `setResolution` from the bridge. There is no timeout. While the relay is down, submitting both evidences locks the escrow permanently. Route Court therefore has only the side GenLayer ruled for submit evidence; `resolveByDefault` then settles to that side.

---

## Real vs not performed

- **Real:** LI.FI route data (mainnet, live API). Internet Court factory and agreements on Base Sepolia. Escrow in Internet Court's MockUSDC. The GenLayer jury verdict from our own judge on GenLayer Studio Next.
- **Not performed:** the cross-chain transfer itself. The dispute is about the agent's route decision, which is fully captured before execution. Executing would only add a mainnet cost, not change what the court judges.
- **Relay:** Internet Court's own GenLayer bridge relay is down on Base Sepolia (see above), so the verdict reaches the agreement through the parties: only the favoured side submits evidence, and `resolveByDefault` settles.
- **Demo wallets:** USER `0x7055…B63D` and AGENT `0x68AE…1B93` are both controlled by the builder.
- **Selected policy:** Case B's agent uses a hardcoded preferred bridge. USDC to USDC spreads are too tight for a "fastest route" agent to overpay meaningfully ($0.02 to save 5 seconds), so a fair breach case needed a real, common failure: a bridge hardcoded into the agent.

## Trust model

- **Snapshot:** tamper-evident. `snapshot.json` is committed, and its sha256 is quoted in the on-chain evidence and stored on the GenLayer judge. `npm run verify` recomputes it. The exact LI.FI response bytes are stored next to it with their own hash.
- **Facts:** deterministic, unit tested, recomputable from the snapshot by anyone.
- **Judgment:** GenLayer consensus with independent re-judging validators.
- **Carrying the verdict to Base:** this is the trust gap while the relay is down. The parties carry it; the on-chain evidence names the GenLayer tx so anyone can check the agreement settled the way the jury ruled. When Internet Court's relay is back, the same agreement terms and evidence go through `submitEvidence` by both sides and the bridge delivers the verdict, with no change to the facts, snapshot or judge prompt.
- **Studio Next** may be reset by GenLayer. The jury verdicts and reasoning are also saved in `cases/*/genlayer.json` and the manifest.

### Guards (must fail, all recorded on-chain)

| Guard | Result |
|---|---|
| 1. Non-party calls `raiseDispute` | Reverted: "Only a party" ([tx](https://sepolia.basescan.org/tx/0xe8fe3cd9c8579efec3ced3f2531e6ae0b091e18579e1ec095bb4bf4527e16a40)) |
| 2. USER calls `raiseDispute` a second time | Reverted: "Wrong status" ([tx](https://sepolia.basescan.org/tx/0xf182a777c161fe7e74b8f3404fb430f7ecbcf87cc6d28cfc8ab62dc6b042d2ca)) |
| 3. `submitEvidence` after the window | Reverted: "Evidence deadline passed" ([tx](https://sepolia.basescan.org/tx/0x949e0842d6d307a962b4b9a68f50651c18443ceed639646f4f67dc03f71f3775)) |
| 4. Evidence quoting a wrong snapshot hash | Refused by our script before sending |

---

## Reproduce it

Node 22.9 or newer. `npm install` first.

**Level 1: no wallet, no keys, 30 seconds**
```
npm run dry-run -- --mode preferred
```
Fetches live LI.FI routes, computes facts, lets the agent pick, writes the hashed snapshot and prints the exact evidence string the court would receive.

**Level 2: verify our two cases, no keys**
```
npm run verify -- --case A
npm run verify -- --case B
```
Reads each agreement on Base Sepolia and the GenLayer judge, recomputes the committed snapshot hash and checks it against both chains.

**Level 3: full replay with your own wallet**
```
npm run demo -- --case B
```
The first run creates demo keys in `.env` and prints the USER address. Send it about 0.005 Base Sepolia ETH, run again, and the script mints MockUSDC, captures live routes, opens an Internet Court agreement, raises the dispute, asks the GenLayer judge, settles and claims. About 20 minutes, mostly the evidence window. `--case A` runs the faithful agent.

See [`TESTING.md`](TESTING.md) for the unit tests and every script, and [`skill/SKILL.md`](skill/SKILL.md) to give any agent this capability.

## Repository map

```
lib/lifi.mjs        LI.FI client and the demo request
lib/facts.mjs       route facts and agent policies (pure, unit tested)
lib/evidence.mjs    evidence string, sha256
lib/terms.mjs       statement, guidelines, constraints shared by both courts
lib/court.mjs       Internet Court ABIs (from the verified source) and helpers
lib/genlayer.mjs    GenLayer Studio Next client
contracts/route_judge.py           the GenLayer judge (GenVM v0.4)
contracts/GENVM_V04_NOTES.md       v0.4 API changes we hit (no `gl` object, header rules)
scripts/00..70, demo.mjs           discovery, capture, open, dispute, resolve, guards, manifest, verify
site/                              the static website (index.html + data.json from npm run site-data)
cases/                             frozen snapshots, evidence, verdicts for cases A and B
deployments/base-sepolia/          manifest.json, guards.json, wallets.json
discovery/                         Gate 0 findings and the raw LI.FI probe
```
