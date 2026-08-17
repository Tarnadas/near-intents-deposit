import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import type { TokenResponse } from "@defuse-protocol/one-click-sdk-typescript";

/** Structural subset of @solana/web3.js Connection used for balance reads. */
export type SolanaRpcConnection = Pick<
  Connection,
  "getBalance" | "getParsedTokenAccountsByOwner"
>;

export const CHAIN_RPC_URLS: Record<string, string> = {
  eth: "https://ethereum-rpc.publicnode.com",
  arb: "https://arbitrum-one-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  op: "https://optimism-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  pol: "https://polygon-bor-rpc.publicnode.com",
  avax: "https://avalanche-c-chain-rpc.publicnode.com",
  gnosis: "https://gnosis-rpc.publicnode.com",
  // publicnode blocks getTokenAccountsByOwner ("Request blocked"); the official
  // endpoint allows it and is the same URL Orderly's chain_info publishes
  sol: "https://api.mainnet-beta.solana.com",
};

const SOLANA_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

interface SolanaParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: { amount: string; decimals: number };
        };
      };
    };
  };
}

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
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "rpc error");
  return json.result;
}

async function fetchErc20Balance(
  rpcUrl: string,
  wallet: string,
  contract: string,
): Promise<bigint> {
  const result = (await rpcCall(rpcUrl, "eth_call", [
    { to: contract, data: encodeBalanceOf(wallet) },
    "latest",
  ])) as string;
  return BigInt(result === "0x" ? 0 : result);
}

async function fetchNativeBalance(
  rpcUrl: string,
  wallet: string,
): Promise<bigint> {
  const result = (await rpcCall(rpcUrl, "eth_getBalance", [wallet, "latest"])) as string;
  return BigInt(result);
}

/** Solana: one getBalance + one getTokenAccountsByOwner call for all SPL tokens. */
async function fetchSolanaBalances(
  rpcUrl: string,
  wallet: string,
  tokens: TokenResponse[],
  connection?: SolanaRpcConnection,
): Promise<Record<string, string>> {
  const nativeTokens = tokens.filter((t) => !t.contractAddress);
  const splTokens = tokens.filter(
    (t): t is TokenResponse & { contractAddress: string } => !!t.contractAddress,
  );
  const next: Record<string, string> = {};

  // Preferred path: the wallet adapter's Connection. On mainnet with no
  // host-configured RPC it routes through Orderly's signed RPC proxy
  // (/v1/solana-rpc-proxy) — no public-endpoint rate limiting (the official
  // api.mainnet-beta.solana.com 403s per-IP).
  if (connection) {
    const owner = new PublicKey(wallet);
    const [nativeRes, splRes] = await Promise.allSettled([
      connection.getBalance(owner, "confirmed"),
      splTokens.length > 0
        ? connection.getParsedTokenAccountsByOwner(owner, {
            programId: new PublicKey(SOLANA_TOKEN_PROGRAM_ID),
          })
        : Promise.resolve({ value: [] as SolanaParsedTokenAccount[] }),
    ]);

    if (nativeRes.status === "fulfilled") {
      const lamports = BigInt(nativeRes.value ?? 0);
      for (const t of nativeTokens) {
        next[t.assetId] = formatBalance(lamports, t.decimals);
      }
    }

    const splValue = splRes.status === "fulfilled" ? splRes.value : null;
    if (Array.isArray(splValue?.value)) {
      const mintToRaw = new Map<string, bigint>();
      for (const acc of splValue.value) {
        const info = acc?.account?.data?.parsed?.info;
        const amount = info?.tokenAmount?.amount;
        if (!info?.mint || !amount) continue;
        mintToRaw.set(info.mint, BigInt(amount));
      }
      for (const t of splTokens) {
        const raw = mintToRaw.get(t.contractAddress);
        if (raw !== undefined) {
          next[t.assetId] = formatBalance(raw, t.decimals);
        }
      }
    }

    if (nativeRes.status === "fulfilled" || splValue) {
      return next;
    }
    // both reads rejected (e.g. unregistered account cannot sign proxy
    // requests) — fall through to the direct public RPC
    console.debug("[balances] solana connection read failed, trying public rpc");
  }

  const [nativeRes, splRes] = await Promise.allSettled([
    rpcCall(rpcUrl, "getBalance", [wallet, { commitment: "confirmed" }]),
    splTokens.length > 0
      ? rpcCall(rpcUrl, "getTokenAccountsByOwner", [
          wallet,
          { programId: SOLANA_TOKEN_PROGRAM_ID },
          { encoding: "jsonParsed" },
        ])
      : Promise.resolve(null),
  ]);

  if (nativeRes.status === "fulfilled") {
    const lamports = BigInt(
      (nativeRes.value as { value?: string | number } | null)?.value ?? 0,
    );
    for (const t of nativeTokens) {
      next[t.assetId] = formatBalance(lamports, t.decimals);
    }
  }

  const splValue = splRes.status === "fulfilled" ? splRes.value : null;
  const accounts = (splValue as { value?: SolanaParsedTokenAccount[] } | null)?.value;
  if (Array.isArray(accounts)) {
    const mintToRaw = new Map<string, bigint>();
    for (const acc of accounts) {
      const info = acc?.account?.data?.parsed?.info;
      const amount = info?.tokenAmount?.amount;
      if (!info?.mint || !amount) continue;
      mintToRaw.set(info.mint, BigInt(amount));
    }
    for (const t of splTokens) {
      const raw = mintToRaw.get(t.contractAddress);
      if (raw !== undefined) {
        // use the token-list decimals so the amount matches the rawAmount math
        next[t.assetId] = formatBalance(raw, t.decimals);
      }
    }
  }
  return next;
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
  solanaConnection?: SolanaRpcConnection,
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
        if (blockchain === "sol") {
          const next = await fetchSolanaBalances(
            rpcUrl,
            walletAddress,
            tokens,
            solanaConnection,
          );
          if (cancelled) return;
          setBalances(next);
          setLoading(false);
          return;
        }

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
  }, [walletAddress, blockchain, tokenKey, solanaConnection]);

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
