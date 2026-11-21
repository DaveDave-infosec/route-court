// Base Sepolia demo wallets. Run it twice:
//  1st run: creates USER and AGENT keys in .env (if missing) and prints USER's address to fund from a faucet.
//  2nd run (USER has ETH): sends AGENT a little ETH for gas and mints MockUSDC to USER.
import fs from "node:fs";
import { formatEther, parseEther, formatUnits, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ADDR, EXPLORER, erc20Abi, publicClient, walletFor, sendAndLog } from "../lib/court.mjs";

function ensureKey(name) {
  if (process.env[name]) return process.env[name];
  const pk = generatePrivateKey();
  const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
  fs.appendFileSync(".env", `${env && !env.endsWith("\n") ? "\n" : ""}${name}=${pk}\n`);
  console.log(`created ${name} (saved to .env, which git ignores)`);
  return pk;
}

const userPk = ensureKey("USER_PK");
const agentPk = ensureKey("AGENT_PK");
const USER = privateKeyToAccount(userPk).address;
const AGENT = privateKeyToAccount(agentPk).address;

async function balances() {
  const [ue, ae, uu, au] = await Promise.all([
    publicClient.getBalance({ address: USER }),
    publicClient.getBalance({ address: AGENT }),
    publicClient.readContract({ address: ADDR.mockUSDC, abi: erc20Abi, functionName: "balanceOf", args: [USER] }),
    publicClient.readContract({ address: ADDR.mockUSDC, abi: erc20Abi, functionName: "balanceOf", args: [AGENT] }),
  ]);
  console.log(`USER  ${USER}  ${formatEther(ue)} ETH  ${formatUnits(uu, 6)} MockUSDC`);
  console.log(`AGENT ${AGENT}  ${formatEther(ae)} ETH  ${formatUnits(au, 6)} MockUSDC`);
  return { ue, ae, uu, au };
}

let b = await balances();
if (b.ue < parseEther("0.003")) {
  // No process.exit(): on Windows it can abort while sockets close (libuv assertion).
  console.log(`\nUSER needs Base Sepolia ETH. Send at least 0.005 ETH to:\n${USER}\nthen run this script again.`);
} else {

  const user = walletFor(userPk);
  if (b.ae < parseEther("0.0005")) {
    const hash = await user.sendTransaction({ to: AGENT, value: parseEther("0.001") });
    console.log(`fund AGENT gas: ${hash}\n  ${EXPLORER}/tx/${hash}`);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    fs.mkdirSync("data", { recursive: true });
    fs.appendFileSync("data/txlog.jsonl", JSON.stringify({ at: new Date().toISOString(), label: "fund AGENT gas", hash, status: r.status, block: Number(r.blockNumber) }) + "\n");
  }
  if (b.uu < parseUnits("20", 6)) {
    await sendAndLog("mint 100 MockUSDC to USER", user, {
      address: ADDR.mockUSDC, abi: erc20Abi, functionName: "mint", args: [USER, parseUnits("100", 6)],
    });
  }
  console.log("\nafter:");
  b = await balances();
  fs.mkdirSync("deployments/base-sepolia", { recursive: true });
  fs.writeFileSync("deployments/base-sepolia/wallets.json", JSON.stringify({ USER, AGENT, note: "demo wallets, both controlled by the builder" }, null, 2) + "\n");
}
