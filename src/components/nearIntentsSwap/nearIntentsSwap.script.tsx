import { useState, useMemo, useCallback } from "react";
import type { TokenResponse } from "@defuse-protocol/one-click-sdk-typescript";
import type { QuoteResponse } from "@defuse-protocol/one-click-sdk-typescript";
import type { GetExecutionStatusResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { useTokens } from "../../hooks/useTokens";
import { useQuote } from "../../hooks/useQuote";
import { useSwapStatus } from "../../hooks/useSwapStatus";
import { DEFAULT_SLIPPAGE } from "../../config";

export type SwapPhase = "idle" | "quoting" | "ready" | "active";

export interface NearIntentsSwapScriptOptions {
  jwtToken?: string;
  slippageTolerance?: number;
}

export interface NearIntentsSwapScriptResult {
  tokens: TokenResponse[];
  tokensLoading: boolean;
  tokensError: string | null;

  originAsset: string;
  destinationAsset: string;
  setOriginAsset: (assetId: string) => void;
  setDestinationAsset: (assetId: string) => void;

  amount: string;
  setAmount: (amount: string) => void;
  recipient: string;
  setRecipient: (address: string) => void;

  swapTokens: () => void;

  dryQuote: QuoteResponse | null;
  quoteLoading: boolean;
  quoteError: string | null;

  activeQuote: QuoteResponse | null;
  phase: SwapPhase;
  handleSwap: () => Promise<void>;

  swapStatus: GetExecutionStatusResponse | null;
  statusError: string | null;
}

export function useNearIntentsSwapScript(
  options: NearIntentsSwapScriptOptions = {},
): NearIntentsSwapScriptResult {
  const { jwtToken, slippageTolerance = DEFAULT_SLIPPAGE } = options;

  const { tokens, loading: tokensLoading, error: tokensError } = useTokens(jwtToken);
  const { quote: dryQuote, loading: quoteLoading, error: quoteError, fetchQuote, reset: resetQuote } =
    useQuote(jwtToken);
  const { status: swapStatus, error: statusError, startPolling } = useSwapStatus(jwtToken);

  const [originAsset, setOriginAsset] = useState("");
  const [destinationAsset, setDestinationAsset] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [activeQuote, setActiveQuote] = useState<QuoteResponse | null>(null);
  const [phase, setPhase] = useState<SwapPhase>("idle");

  const sortedTokens = useMemo(
    () => [...tokens].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [tokens],
  );

  const originToken = useMemo(
    () => tokens.find((t) => t.assetId === originAsset),
    [tokens, originAsset],
  );

  const amountInRaw = useMemo(() => {
    if (!amount || !originToken) return "";
    const parsed = parseFloat(amount);
    if (isNaN(parsed)) return "";
    return (BigInt(Math.round(parsed * 1e6)) * BigInt(10) ** BigInt(originToken.decimals - 6)).toString();
  }, [amount, originToken]);

  const swapTokens = useCallback(() => {
    setOriginAsset(destinationAsset);
    setDestinationAsset(originAsset);
    resetQuote();
    setPhase("idle");
  }, [originAsset, destinationAsset, resetQuote]);

  const handleSwap = useCallback(async () => {
    if (!amountInRaw || !originAsset || !destinationAsset || !recipient) return;

    setPhase("quoting");
    const result = await fetchQuote(
      {
        originAsset,
        destinationAsset,
        amount: amountInRaw,
        recipient,
        refundTo: recipient,
        slippageTolerance,
      },
      false,
    );

    if (result?.quote?.depositAddress) {
      setActiveQuote(result);
      setPhase("active");
      startPolling(
        result.quote.depositAddress,
        result.quote.depositMemo,
      );
    }
  }, [
    amountInRaw,
    originAsset,
    destinationAsset,
    recipient,
    fetchQuote,
    startPolling,
    slippageTolerance,
  ]);

  return {
    tokens: sortedTokens,
    tokensLoading,
    tokensError,

    originAsset: originAsset || (sortedTokens[0]?.assetId ?? ""),
    destinationAsset:
      destinationAsset || (sortedTokens[1]?.assetId ?? ""),
    setOriginAsset: (id) => {
      setOriginAsset(id);
      resetQuote();
      setPhase("idle");
    },
    setDestinationAsset: (id) => {
      setDestinationAsset(id);
      resetQuote();
      setPhase("idle");
    },

    amount,
    setAmount,
    recipient,
    setRecipient,

    swapTokens,

    dryQuote,
    quoteLoading,
    quoteError,

    activeQuote,
    phase,
    handleSwap,

    swapStatus,
    statusError,
  };
}
