# Gate 0 findings (2026-11-20)

Source: verified InternetCourtFactory v2 on Blockscout (Agreement.sol included), factory logs, MockUSDC bytecode.
Confirm by running `npm run discover`.

## Money flow
- The FACTORY pulls the escrow from the creator (party A) with transferFrom before it deploys the agreement. Agreement.sol never calls transferFrom.
- So party A approves the FACTORY address for the escrow amount, then calls createAgreement.
- acceptAgreement: party B only, status CREATED, before joinDeadline. Party B pays nothing.
- Payout is pull-based: the verdict credits pendingWithdrawals, then the winner calls claimFunds().

## Who gets paid (this flips the scaffold)
- TRUE_ credits party A.
- FALSE_ credits party B.
- UNDETERMINED refunds party A.
- Party A is USER (funds the fee). Party B is AGENT.
- So the statement must be worded so TRUE_ = USER refunded:
  "The route the agent committed to for transfer {caseRef} broke the user's mandate, given the routes LI.FI offered at {capturedAtISO}."
- Case A (faithful) expects FALSE_ (agent paid). Case B (lazy) expects TRUE_ (user refunded).

## Happy path (no court)
- proposeOutcome(false) by one party, confirmOutcome() by the other, while ACTIVE. Resolves at once, agent credited.
- If both propose and differ, the contract auto-disputes (AutoDisputed + DisputeRaised).

## Dispute path
- raiseDispute(): either party, ACTIVE only. Records disputeTimestamp and disputeInitiator. Does NOT call the factory.
- submitEvidence(): either party, DISPUTED only, once each, deadline = disputeTimestamp + evidenceDeadlineSeconds.
- When BOTH have submitted: status RESOLVING, factory.requestDispute, factory emits DisputeRequested. GenLayer jury then answers through the bridge, factory calls setResolution(verdict, reasoning).
- closeEvidenceWindow(): anyone, after the window, both submitted: same trigger.
- resolveByDefault(): anyone, after the window, NOT both submitted. No evidence: initiator wins. One side only: that side wins. Goes straight to RESOLVED.

## Parameters
- No minimum or maximum on evidenceDeadlineSeconds. 0 = no submit deadline, 7 day grace for close/default.
- maxEvidenceLength 0 = unlimited.
- joinDeadline 0 = none.
- MockUSDC: decimals 6, mint(address,uint256) open to anyone.

## Guard reverts we expect (exact strings in Agreement.sol)
- Non-party raiseDispute: "Only a party"
- Second raiseDispute: "Wrong status"
- Late submitEvidence: "Evidence deadline passed"
- Second submitEvidence by the same party: "Already submitted"

## Jury relay status
- Last VerdictReceived on the factory: 2026-03-19 (block 39068666).
- Last DisputeRequested: 2026-11-09 (block 56535302, case 0x1A5499A8E9D53857CBaAEa1e978876233aD62568). No verdict after 11 days.
- Agreements #19 and #20 were created 2026-11-10 (the third party who fell back to resolveByDefault).
- Verdict: JURY NOT LIVE. Decision tree says post in the WG thread and build Fallback B.

## Risk found
- Once both parties submit evidence, the agreement is RESOLVING and the ONLY exit is setResolution from the factory (bridge). There is no timeout out of RESOLVING.
- While the relay is down, submitting both evidences locks the escrow permanently.
- Safe fallback path while the relay is down: only the side the GenLayer verdict favours submits, then resolveByDefault after the window. Or settle by proposeOutcome/confirmOutcome before any dispute.

## Confirmed by `npm run discover` on David's machine (2026-11-20 09:16 WAT)
- nextAgreementId 21. bridgeReceiver matches. Factory owner 0xe9630ba0e3cc2d3BFC58fbE1Bbde478f06E4CE87.
- MockUSDC symbol USDC, decimals 6.
- 52 factory logs: AgreementCreated 7, DisputeRequested 16, CaseRegistered 14, VerdictReceived 14, OwnershipTransferred 1.
- Last VerdictReceived 2026-03-19T07:33:40Z (block 39068666). Last DisputeRequested 2026-11-09T12:55:29Z (block 56535302).
- Two disputes never answered: 0x1A5499A8...2568 (2026-11-09, a registerCase case, not an Agreement: its Agreement getters revert) and 0x53FA618a...4c8c (2026-03-10).
- #19 and #20 (2026-11-10) both RESOLVED by resolveByDefault ("only dispute initiator submitted evidence").
- #15 and #16 (factory owner as party A) got VerdictReceived about 10 seconds after DisputeRequested, with identical reasoning text. Noted only as an observation; not used as evidence the relay works today.
- Result: JURY NOT LIVE. Fallback B.

## Tooling notes
- The public RPC prunes history before block 47,500,000. Old block timestamps come from Blockscout /blocks/{n}.
- Windows PowerShell 5 does not accept `&&`. Use `;`.

## Peer check: Gen. Dave (WG, x402 x GenLayer build), 2026-11-21
- He did not use LI.FI or a shared Internet Court relay.
- His components submit the case directly to GenLayer StudioNet, reconcile finality, then a seller Base Sepolia wallet executes the exact refund.
- GitHub Actions and a public wake only advance jobs; they are schedulers, not verdict relays.
- Reading: no working shared relay is in use by WG builders. Fallback B matches current practice.

## Fallback B settlement path (decided)
1. USER raiseDispute() on the agreement (ACTIVE -> DISPUTED). Internet Court records the dispute on-chain.
2. Our GenLayer Intelligent Contract (route_judge.py, GenVM v0.4, Studio Next) judges the same evidence string and stores verdict + reasoning.
3. Only the side the GenLayer verdict favours submits evidence on the agreement. That evidence quotes the GenLayer contract address and tx hash.
4. After the evidence window, anyone calls resolveByDefault(): the only submitter wins. Escrow credited, winner calls claimFunds().
- Never both submit while the relay is down (that locks the escrow in RESOLVING).
- Trust disclosed in README: the parties' wallets carry the GenLayer verdict to Base, as in other WG builds. The on-chain record still shows dispute, evidence, resolution and payout.
