// GenLayer Studio Next (chain 61997) client for the Route Court judge (GenVM v0.4).
import fs from "node:fs";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

export const GENLAYER_RPC = process.env.GENLAYER_RPC || "https://studio-next.genlayer.com/api";
export const JUDGE_ADDRESS = process.env.ROUTE_JUDGE || "0xf20126D9bdD345069E0C65B66811E05A22480686";
export const studioNext = { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: [GENLAYER_RPC] } } };

// Uses GENLAYER_PK from .env; creates and saves one on first run (Studio test key only).
export function judgeAccount() {
  let pk = process.env.GENLAYER_PK;
  if (!pk) {
    pk = generatePrivateKey();
    fs.appendFileSync(".env", `${fs.existsSync(".env") && !fs.readFileSync(".env", "utf8").endsWith("\n") ? "\n" : ""}GENLAYER_PK=${pk}\n`);
    console.log("created a Studio Next test account; key saved to .env as GENLAYER_PK");
  }
  return createAccount(pk);
}

export function judgeClient(account) {
  return createClient({ chain: studioNext, account });
}
