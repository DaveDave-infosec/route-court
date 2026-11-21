// LI.FI REST client. No key needed (200 requests per 2 hours unauthenticated).
export const LIFI = "https://li.quest/v1";

// The demo request: 1,000 USDC Base -> Arbitrum, USDC to USDC. No signing ever happens.
export const DEMO_REQUEST = {
  fromChainId: 8453,
  toChainId: 42161,
  fromTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  toTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // native USDC on Arbitrum
  fromAmount: "1000000000", // 1,000 USDC (6 decimals)
  fromAddress: "0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0",
  toAddress: "0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0",
  options: { slippage: 0.005, allowSwitchChain: false },
};

// Returns the raw body text exactly as LI.FI sent it, plus the parsed JSON.
export async function fetchRoutes(request = DEMO_REQUEST) {
  const res = await fetch(`${LIFI}/advanced/routes`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LI.FI ${res.status}: ${text.slice(0, 400)}`);
  return {
    text,
    json: JSON.parse(text),
    rateLimit: {
      limit: res.headers.get("ratelimit-limit") ?? res.headers.get("x-ratelimit-limit"),
      remaining: res.headers.get("ratelimit-remaining") ?? res.headers.get("x-ratelimit-remaining"),
    },
  };
}
