import { useState, useEffect, useRef, useCallback } from "react";
import { OneClickService } from "@defuse-protocol/one-click-sdk-typescript";
import type { GetExecutionStatusResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { configureOneClick, STATUS_POLL_INTERVAL_MS } from "../config";

export interface UseSwapStatusResult {
  status: GetExecutionStatusResponse | null;
  loading: boolean;
  error: string | null;
  startPolling: (depositAddress: string, depositMemo?: string) => void;
  stopPolling: () => void;
}

const TERMINAL_STATES = new Set<string>([
  "SUCCESS",
  "REFUNDED",
  "FAILED",
]);

export function useSwapStatus(jwtToken?: string): UseSwapStatusResult {
  const [status, setStatus] = useState<GetExecutionStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const addrRef = useRef<{ address: string; memo?: string } | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setLoading(false);
  }, []);

  const poll = useCallback(async () => {
    if (!addrRef.current) return;
    configureOneClick(jwtToken);

    try {
      const result = await OneClickService.getExecutionStatus(
        addrRef.current.address,
        addrRef.current.memo,
      );
      setStatus(result);
      setError(null);

      if (TERMINAL_STATES.has(result.status)) {
        stopPolling();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to check swap status";
      setError(msg);
      stopPolling();
    }
  }, [jwtToken, stopPolling]);

  const startPolling = useCallback(
    (depositAddress: string, depositMemo?: string) => {
      stopPolling();
      setStatus(null);
      setError(null);
      setLoading(true);
      addrRef.current = { address: depositAddress, memo: depositMemo };

      poll();

      timerRef.current = setInterval(poll, STATUS_POLL_INTERVAL_MS);
    },
    [poll, stopPolling],
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return { status, loading, error, startPolling, stopPolling };
}
