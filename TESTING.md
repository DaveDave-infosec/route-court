# Testing Route Court

Node 22.9 or newer (scripts use `--env-file-if-exists`). Run `npm install` once.

## Unit tests (no network)

```
npm test
```

Ten `node:test` tests run against a real LI.FI response captured on 2026-11-21 (`tests/fixtures/lifi-routes-20261121.json`, 13 routes):

1. All 13 routes are mapped.
2. LI.FI's "Integrator Fee" step is not counted as a hop.
3. Net received = USDC delivered minus gas minus fees charged on top of the quote (StargateV2's $1.3344 LayerZero fee, Glacis' $0.2976 bridge fee).
4. The 10 minute limit is applied to LI.FI's estimate (Polymer Standard, 1080 s, is too slow).
5. The faithful agent skips the cheapest-but-too-slow route and picks LI.FI Intents.
6. The preferred-bridge agent picks StargateV2 and receives about $1.86 less, 21 s slower.
7. The lazy agent picks a FASTEST-tagged route.
8. A missing preferred bridge is an error, never a silent fallback.
9. Evidence strings for both sides fit 4,000 characters and quote the hash, the mandate and both routes.
10. `sha256File` hashes exact file bytes.

## Scripts

| Command | What it does | Needs |
|---|---|---|
| `npm run discover` | Gate 0, read-only: factory facts, all factory logs, last 6 agreements, jury relay liveness | nothing |
| `npm run lifi-probe` | Logs one raw `/advanced/routes` response to `discovery/` | nothing |
| `npm run dry-run -- --mode faithful\|preferred\|lazy` | Level 1: live capture, facts, pick, snapshot, evidence string | nothing |
| `npm run pick -- --case X --mode ...` | Captures a real case into `cases/` | nothing |
| `npm run judge -- --dry-run` | Files the newest dry run with the GenLayer judge | creates a Studio Next test key |
| `npm run wallets` | Creates USER/AGENT keys, funds AGENT gas, mints MockUSDC | USER funded with Base Sepolia ETH |
| `npm run open-case -- --case X` | Approve, `createAgreement`, `acceptAgreement`, read back | wallets |
| `npm run dispute -- --case X` | `raiseDispute`, GenLayer judge, winner-only `submitEvidence` | wallets |
| `npm run resolve -- --case X` | Waits out the window, `resolveByDefault`, `claimFunds`, balances before/after | wallets |
| `npm run guards -- --case X --phase active\|disputed\|late` | The four guard checks, real reverted txs | wallets |
| `npm run manifest` | Writes `deployments/base-sepolia/manifest.json` | nothing |
| `npm run verify -- --case A\|B` | Level 2: re-checks a case on both chains | nothing |
| `npm run demo -- --case A\|B` | Level 3: the whole flow with a fresh case id | wallets |

Every write prints its tx hash and Basescan link, is appended to `data/txlog.jsonl`, and state is read back after each write.

## What we ran (2026-11-21)

1. `npm run discover`: jury relay down since 2026-03-19, Fallback B.
2. `npm run judge -- --dry-run` on a StargateV2 dry run: TRUE (`discovery/jury-dry-run-DRY-20261121-154535.json`).
3. Case A: `pick --mode faithful`, `open-case`, `guards --phase active`, `dispute`, `guards --phase disputed`, `guards --phase late`, `resolve`. GenLayer FALSE, Internet Court FALSE_, AGENT paid.
4. Case B: `pick --mode preferred`, `open-case`, `dispute`, `resolve`. GenLayer TRUE, Internet Court TRUE_, USER refunded.
5. `npm run manifest`, `npm run verify -- --case A`, `npm run verify -- --case B`: 16 of 16 checks PASS.

## GenVM v0.4

The judge targets runner `py-genlayer:kzybg95x1gn21dw72m7hyg0maaap04n4nx55j9yt6fkdqxtz6bz0`. The API changes we hit (no `gl` object, `vm.run_nondet`, the header block rule) are in `contracts/GENVM_V04_NOTES.md`.
