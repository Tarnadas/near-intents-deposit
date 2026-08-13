import { useState, useEffect, useCallback } from "react";
import { OneClickService } from "@defuse-protocol/one-click-sdk-typescript";
import type { TokenResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { configureOneClick } from "../config";

export interface UseTokensResult {
  tokens: TokenResponse[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTokens(jwtToken?: string): UseTokensResult {
  const [tokens, setTokens] = useState<TokenResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    configureOneClick(jwtToken);

    setLoading(true);
    setError(null);

    OneClickService.getTokens()
      .then((res) => {
        if (!cancelled) {
          setTokens(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load tokens");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jwtToken, nonce]);

  return { tokens, loading, error, refetch };
}
