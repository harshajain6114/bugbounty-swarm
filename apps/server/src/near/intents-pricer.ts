/**
 * apps/server/src/near/intents-pricer.ts
 *
 * Bounty price discovery through NEAR Intents (1Click API).
 *
 * Each bounty is defined in USD (BOUNTY_USD, default $0.03). Before a round
 * opens, we ask the live 1Click API for a DRY quote: "how much wNEAR must go
 * in to receive exactly BOUNTY_USD of USDC on NEAR?" (swapType EXACT_OUTPUT).
 * The quoted amountIn becomes the NEAR escrow attached to open_round.
 *
 * Scope, stated plainly:
 *  - dry: true → no deposit address is issued and no funds move.
 *  - The quote is a mainnet market price; the escrow is posted on testnet.
 *    NEAR Intents has no testnet, so settlement itself is NOT done via Intents.
 *  - If the API is unreachable, a fixed 0.01 NEAR escrow is used and the
 *    round records pricingSource "fixed_fallback".
 */

const ONE_CLICK_URL = process.env.ONE_CLICK_API_URL || "https://1click.chaindefuser.com";
const ORIGIN_ASSET = "nep141:wrap.near";
// Native USDC on NEAR (6 decimals)
const USDC_ASSET = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const FALLBACK_ESCROW_YOCTO = 10_000_000_000_000_000_000_000n; // 0.01 NEAR
const MAX_ESCROW_YOCTO = 50_000_000_000_000_000_000_000n; // 0.05 NEAR safety cap
// Dry-quote recipient: dry quotes issue no deposit address and move nothing,
// but 1Click still validates the recipient (contract accounts and non-existent
// names are rejected with HTTP 400). Default is the account used in the 1Click
// docs' own example; override with INTENTS_QUOTE_RECIPIENT.
const DRY_QUOTE_ACCOUNT = process.env.INTENTS_QUOTE_RECIPIENT || "recipient.near";

export interface BountyPricing {
  pricingSource: "near_intents_1click_dry_quote" | "fixed_fallback";
  bountyUsd: number;
  escrowYocto: string;
  escrowNear: string;
  quote?: {
    amountIn: string;
    amountInUsd?: string;
    amountOut: string;
    amountOutUsd?: string;
    timeEstimateSec?: number;
    signature?: string;
    correlationId?: string;
    timestamp?: string;
  };
  error?: string;
}

function yoctoToNear(yocto: bigint): string {
  const whole = yocto / 10n ** 24n;
  const frac = (yocto % 10n ** 24n).toString().padStart(24, "0").slice(0, 6);
  return `${whole}.${frac}`;
}

export async function priceBountyViaIntents(bountyUsd = Number(process.env.BOUNTY_USD || "0.03")): Promise<BountyPricing> {
  const usdcUnits = Math.round(bountyUsd * 1_000_000).toString();
  const body = {
    dry: true,
    swapType: "EXACT_OUTPUT",
    slippageTolerance: 100,
    originAsset: ORIGIN_ASSET,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: USDC_ASSET,
    amount: usdcUnits,
    refundTo: DRY_QUOTE_ACCOUNT,
    refundType: "ORIGIN_CHAIN",
    recipient: DRY_QUOTE_ACCOUNT,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.ONE_CLICK_API_KEY) headers["X-API-Key"] = process.env.ONE_CLICK_API_KEY;

  try {
    const res = await fetch(`${ONE_CLICK_URL}/v0/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json()) as {
      quote?: { amountIn?: string; amountInUsd?: string; amountOut?: string; amountOutUsd?: string; timeEstimate?: number };
      signature?: string;
      correlationId?: string;
      timestamp?: string;
      message?: string;
    };
    if (!res.ok || !data.quote?.amountIn) {
      throw new Error(`1Click quote HTTP ${res.status}: ${data.message ?? "no amountIn"}`);
    }

    let escrow = BigInt(data.quote.amountIn);
    if (escrow > MAX_ESCROW_YOCTO) escrow = MAX_ESCROW_YOCTO;
    if (escrow <= 0n) throw new Error("1Click quote returned non-positive amountIn");

    return {
      pricingSource: "near_intents_1click_dry_quote",
      bountyUsd,
      escrowYocto: escrow.toString(),
      escrowNear: yoctoToNear(escrow),
      quote: {
        amountIn: data.quote.amountIn,
        amountInUsd: data.quote.amountInUsd,
        amountOut: data.quote.amountOut ?? usdcUnits,
        amountOutUsd: data.quote.amountOutUsd,
        timeEstimateSec: data.quote.timeEstimate,
        signature: data.signature,
        correlationId: data.correlationId,
        timestamp: data.timestamp,
      },
    };
  } catch (err) {
    return {
      pricingSource: "fixed_fallback",
      bountyUsd,
      escrowYocto: FALLBACK_ESCROW_YOCTO.toString(),
      escrowNear: yoctoToNear(FALLBACK_ESCROW_YOCTO),
      error: (err as Error).message,
    };
  }
}
