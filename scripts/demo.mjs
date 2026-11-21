// Level 3: full replay with your own Base Sepolia wallet.
//   npm run demo -- --case A    (faithful agent, expect FALSE: agent paid)
//   npm run demo -- --case B    (preferred-bridge agent, expect TRUE: user refunded)
// Needs USER_PK in .env with a little Base Sepolia ETH (the wallets step creates the keys
// and tells you the address to fund). Uses a fresh case id so committed cases A and B are untouched.
import { execFileSync } from "node:child_process";
import { parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ADDR, erc20Abi, publicClient } from "../lib/court.mjs";

const letter = process.argv[process.argv.indexOf("--case") + 1];
if (!["A", "B"].includes(letter)) throw new Error("--case A|B");
const mode = letter === "A" ? "faithful" : "preferred";
const id = `${letter}R${Math.floor(Date.now() / 1000)}`;
const run = (script, ...args) => execFileSync(process.execPath, [`scripts/${script}`, ...args], { stdio: "inherit", env: process.env });

run("05-wallets.mjs");
if (!process.env.USER_PK) {
  console.log("\nkeys were just created in .env; fund USER as printed above, then run the demo again.");
} else {
  const usdc = await publicClient.readContract({ address: ADDR.mockUSDC, abi: erc20Abi, functionName: "balanceOf", args: [privateKeyToAccount(process.env.USER_PK).address] });
  if (usdc < parseUnits("5", 6)) {
    console.log("\nUSER has no MockUSDC yet (fund USER with Base Sepolia ETH, then run the demo again).");
  } else {
    console.log(`\n=== replay case ${id} (${mode}) ===`);
    run("10-agent-pick.mjs", "--case", id, "--mode", mode);
    run("20-open-case.mjs", "--case", id);
    run("30-dispute.mjs", "--case", id);
    run("40-resolve.mjs", "--case", id);
  }
}
