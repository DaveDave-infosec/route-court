// Internet Court on Base Sepolia (84532). ABIs taken from the verified
// InternetCourtFactory v2 source (Agreement.sol) on Blockscout, 2026-11-20.
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import fs from "node:fs";

export const ADDR = {
  factory: "0xd533cB0B52E85b3F506b6f0c28b8f6bc4E449Dda",
  bridgeReceiver: "0xc3e6ae892a704c875bf74df46ed873308db15d82",
  mockUSDC: "0x58C27C7C1Ff5DBF480c956acf6b119508b6FBa4f",
  exampleCase15: "0x32cb0d3E1671088CaAfE62E7cBCe1B875876A035",
};
export const BLOCKSCOUT = "https://base-sepolia.blockscout.com/api/v2";
export const EXPLORER = "https://sepolia.basescan.org";

export const STATUS = ["CREATED", "ACTIVE", "DISPUTED", "RESOLVING", "RESOLVED", "CANCELLED"];
export const VERDICT = ["UNDETERMINED", "TRUE_", "FALSE_"];

export const factoryAbi = parseAbi([
  "function createAgreement(address partyB, string _statement, string _guidelines, string _evidenceDefs, uint256 _evidenceDeadlineSeconds, address _usdcToken, uint256 _escrowAmount, uint256 _joinDeadline, uint256 _maxEvidenceLength, string _constraints) returns (address)",
  "function nextAgreementId() view returns (uint256)",
  "function agreements(uint256) view returns (address)",
  "function agreementIds(address) view returns (uint256)",
  "function deployedAgreements(address) view returns (bool)",
  "function deploymentBlock() view returns (uint256)",
  "function bridgeReceiver() view returns (address)",
  "function owner() view returns (address)",
  "event AgreementCreated(uint256 indexed id, address agreementAddress, address partyA, address partyB)",
  "event DisputeRequested(address indexed agreementAddress, uint256 timestamp)",
  "event VerdictReceived(address indexed agreementAddress, uint8 verdict)",
]);

export const agreementAbi = parseAbi([
  "function acceptAgreement()",
  "function proposeOutcome(bool statementIsTrue)",
  "function confirmOutcome()",
  "function raiseDispute()",
  "function submitEvidence(string evidence)",
  "function closeEvidenceWindow()",
  "function resolveByDefault()",
  "function claimFunds()",
  "function cancel()",
  "function partyA() view returns (address)",
  "function partyB() view returns (address)",
  "function statement() view returns (string)",
  "function guidelines() view returns (string)",
  "function evidenceDefs() view returns (string)",
  "function constraints() view returns (string)",
  "function evidenceA() view returns (string)",
  "function evidenceB() view returns (string)",
  "function evidenceASubmitted() view returns (bool)",
  "function evidenceBSubmitted() view returns (bool)",
  "function evidenceDeadlineSeconds() view returns (uint256)",
  "function disputeTimestamp() view returns (uint256)",
  "function disputeInitiator() view returns (address)",
  "function activatedTimestamp() view returns (uint256)",
  "function escrowAmount() view returns (uint256)",
  "function joinDeadline() view returns (uint256)",
  "function maxEvidenceLength() view returns (uint256)",
  "function usdcToken() view returns (address)",
  "function factory() view returns (address)",
  "function status() view returns (uint8)",
  "function verdict() view returns (uint8)",
  "function reasoning() view returns (string)",
  "function proposalA() view returns (uint8)",
  "function proposalB() view returns (uint8)",
  "function pendingWithdrawals(address) view returns (uint256)",
]);

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
]);

export function rpcUrl() {
  return process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
}

export const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl()) });

export function walletFor(pk) {
  if (!pk) throw new Error("missing private key");
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  return createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl()) });
}

export async function readAgreement(address) {
  const names = [
    "partyA", "partyB", "status", "verdict", "escrowAmount", "evidenceDeadlineSeconds",
    "disputeTimestamp", "disputeInitiator", "evidenceASubmitted", "evidenceBSubmitted",
    "statement", "reasoning", "proposalA", "proposalB",
  ];
  const vals = await Promise.all(
    names.map((functionName) =>
      publicClient.readContract({ address, abi: agreementAbi, functionName }).catch((e) => `ERR ${e.shortMessage || e.message}`)
    )
  );
  const out = Object.fromEntries(names.map((n, i) => [n, vals[i]]));
  out.statusName = STATUS[Number(out.status)] ?? out.status;
  out.verdictName = VERDICT[Number(out.verdict)] ?? out.verdict;
  return out;
}

// Every write: print hash + explorer link, append to data/txlog.jsonl, wait, return receipt.
export async function sendAndLog(label, wallet, request) {
  const hash = await wallet.writeContract(request);
  console.log(`${label}: ${hash}\n  ${EXPLORER}/tx/${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  fs.mkdirSync("data", { recursive: true });
  fs.appendFileSync(
    "data/txlog.jsonl",
    JSON.stringify({ at: new Date().toISOString(), label, hash, status: receipt.status, block: Number(receipt.blockNumber) }) + "\n"
  );
  if (receipt.status !== "success") throw new Error(`${label} reverted (${hash})`);
  return receipt;
}

export const jsonSafe = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
