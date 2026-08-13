import { useState, useCallback, useEffect } from "react";
import {
  OneClickService,
  QuoteRequest,
} from "@defuse-protocol/one-click-sdk-typescript";
import type { QuoteResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { configureOneClick, QUOTE_DEADLINE_MS } from "../config";

export interface QuoteParams {
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
  slippageTolerance?: number;
}

export interface UseQuoteResult {
  quote: QuoteResponse | null;
  loading: boolean;
  error: string | null;
  fetchQuote: (params: QuoteParams, dry: boolean) => Promise<QuoteResponse | null>;
  reset: () => void;
}

export function useQuote(jwtToken?: string): UseQuoteResult {
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = useCallback(
    async (params: QuoteParams, dry: boolean): Promise<QuoteResponse | null> => {
      configureOneClick(jwtToken);
      setLoading(true);
      setError(null);

      const request: QuoteRequest = {
        dry,
        swapType: QuoteRequest.swapType.EXACT_INPUT,
        slippageTolerance: params.slippageTolerance ?? 100,
        originAsset: params.originAsset,
        depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
        destinationAsset: params.destinationAsset,
        amount: params.amount,
        recipient: params.recipient,
        recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
        refundTo: params.refundTo,
        refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
        deadline: new Date(Date.now() + QUOTE_DEADLINE_MS).toISOString(),
      };

      try {
        const result = await OneClickService.getQuote(request);
        setQuote(result);
        setLoading(false);
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to get quote";
        setError(msg);
        setLoading(false);
        return null;
      }
    },
    [jwtToken],
  );

  const reset = useCallback(() => {
    setQuote(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    return () => configureOneClick(jwtToken);
  }, [jwtToken]);

  return { quote, loading, error, fetchQuote, reset };
}
