import { useState, useEffect } from "react";
import type { TokenResponse } from "@defuse-protocol/one-click-sdk-typescript";

export const CHAIN_RPC_URLS: Record<string, string> = {
  eth: "https://ethereum-rpc.publicnode.com",
  arb: "https://arbitrum-one-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  op: "https://optimism-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  pol: "https://polygon-bor-rpc.publicnode.com",
  avax: "https://avalanche-c-chain-rpc.publicnode.com",
  gnosis: "https://gnosis-rpc.publicnode.com",
};

const BALANCE_OF_SELECTOR = "0x70a08231";
const CONCURRENCY = 20;

function encodeBalanceOf(address: string): string {
  const clean = address.replace(/^0x/, "").toLowerCase();
  return BALANCE_OF_SELECTOR + "0".repeat(64 - clean.length) + clean;
}

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "rpc error");
  return json.result as string;
}

async function fetchErc20Balance(
  rpcUrl: string,
  wallet: string,
  contract: string,
): Promise<bigint> {
  const result = await rpcCall(rpcUrl, "eth_call", [
    { to: contract, data: encodeBalanceOf(wallet) },
    "latest",
  ]);
  return BigInt(result === "0x" ? 0 : result);
}

async function fetchNativeBalance(
  rpcUrl: string,
  wallet: string,
): Promise<bigint> {
  const result = await rpcCall(rpcUrl, "eth_getBalance", [wallet, "latest"]);
  return BigInt(result);
}

async function runChunked<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const settled = await Promise.all(
      chunk.map((item) => fn(item).catch(() => null)),
    );
    settled.forEach((r, j) => {
      results[i + j] = r;
    });
  }
  return results;
}

export interface UseOnchainBalancesResult {
  /** assetId -> human-readable balance string */
  balances: Record<string, string>;
  loading: boolean;
  error: string | null;
}

export function useOnchainBalances(
  walletAddress: string | undefined,
  blockchain: string,
  tokens: TokenResponse[],
): UseOnchainBalancesResult {
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenKey = tokens.map((t) => t.assetId).join(",");

  useEffect(() => {
    const rpcUrl = CHAIN_RPC_URLS[blockchain];
    if (!walletAddress || !rpcUrl || tokens.length === 0) {
      setBalances({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // tokens is a stable reference keyed by tokenKey; split native vs erc20
        const nativeTokens = tokens.filter((t) => !t.contractAddress);
        const erc20Tokens = tokens.filter(
          (t): t is TokenResponse & { contractAddress: string } =>
            !!t.contractAddress,
        );

        const next: Record<string, string> = {};

        if (nativeTokens.length > 0) {
          const nativeBal = await fetchNativeBalance(rpcUrl, walletAddress);
          if (cancelled) return;
          for (const t of nativeTokens) {
            next[t.assetId] = formatBalance(nativeBal, t.decimals);
          }
        }

        const erc20Results = await runChunked(erc20Tokens, CONCURRENCY, (t) =>
          fetchErc20Balance(rpcUrl, walletAddress, t.contractAddress),
        );
        if (cancelled) return;
        erc20Tokens.forEach((t, i) => {
          const bal = erc20Results[i];
          if (bal !== null) {
            next[t.assetId] = formatBalance(bal, t.decimals);
          }
        });

        setBalances(next);
        setLoading(false);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "balance fetch failed");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, blockchain, tokenKey]);

  return { balances, loading, error };
}

function formatBalance(raw: bigint, decimals: number): string {
  if (raw <= 0n) return "0";
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 6);
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString();
}
