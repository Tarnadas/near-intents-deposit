import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  useDepositFormScript,
} from "@orderly.network/ui-transfer";
import { useAccount } from "@orderly.network/hooks";
import { ChainNamespace } from "@orderly.network/types";
import type { API } from "@orderly.network/types";
import type { TokenResponse, QuoteResponse, GetExecutionStatusResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { useTokens } from "../../hooks/useTokens";
import { useQuote } from "../../hooks/useQuote";
import { useSwapStatus } from "../../hooks/useSwapStatus";
import { useOnchainBalances } from "../../hooks/useOnchainBalances";
import type { SolanaRpcConnection } from "../../hooks/useOnchainBalances";
import { useCrossDepositFlow } from "./crossDepositFlow";
import { DEFAULT_SLIPPAGE } from "../../config";

type DepositFormScriptReturn = ReturnType<typeof useDepositFormScript>;

export interface OneClickToken extends API.TokenInfo {
  oneClickAssetId: string;
  oneClickBlockchain: string;
  contractAddress?: string | null;
  balance?: string;
}
const CHAIN_ID_TO_BLOCKCHAIN: Record<number, string> = {
  1: "eth",
  42161: "arb",
  8453: "base",
  10: "op",
  56: "bsc",
  137: "pol",
  43114: "avax",
  100: "gnosis",
  534352: "scroll",
  900900900: "sol",
};

const EVM_BLOCKCHAINS = new Set([
  "eth", "arb", "base", "op", "bsc", "pol", "avax",
  "gnosis", "scroll", "bera", "xlayer", "plasma", "mantle",
  "zksync", "linea", "monad", "abs",
]);

const isEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
const isSolanaAddress = (addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);

function addressMatchesChain(address: string | undefined, blockchain: string): boolean {
  if (!address) return false;
  if (EVM_BLOCKCHAINS.has(blockchain)) return isEvmAddress(address);
  if (blockchain === "sol") return isSolanaAddress(address);
  return false;
}

function toOneClickToken(t: TokenResponse, balance?: string): OneClickToken {
  return {
    symbol: t.symbol,
    display_name: t.symbol,
    address: "",
    decimals: t.decimals,
    precision: 8,
    // the SDK's token dropdown renders `amount`, not `balance`
    amount: balance,
    balance,
    contractAddress: t.contractAddress ?? null,
    oneClickAssetId: t.assetId,
    oneClickBlockchain: t.blockchain,
  } as unknown as OneClickToken;
}

export interface IntegratedDepositScriptOptions {
  jwtToken?: string;
  slippageTolerance?: number;
}

export interface IntegratedDepositScriptResult {
  state: DepositFormScriptReturn;
  overrides: Partial<DepositFormScriptReturn>;
  formProps: DepositFormScriptReturn;
  crossMode: boolean;
  crossToken: OneClickToken | null;
  destToken: TokenResponse | null;
  walletAddress: string | undefined;
  needsManualRefund: boolean;
  manualRefund: string;
  setManualRefund: (value: string) => void;
  activeQuote: QuoteResponse | null;
  swapStatus: GetExecutionStatusResponse | null;
  statusError: string | null;
  flow: ReturnType<typeof useCrossDepositFlow>;
}

export function useIntegratedDepositScript(
  options: IntegratedDepositScriptOptions = {},
): IntegratedDepositScriptResult {
  const { jwtToken, slippageTolerance = DEFAULT_SLIPPAGE } = options;

  const state = useDepositFormScript({});
  const { state: accountState, account } = useAccount();
  // accountState.address is the connected wallet address (available on
  // connect); accountState.accountId only exists after account registration
  const walletAddress = accountState?.address;

  // On Solana the adapter exposes a Connection that routes through Orderly's
  // signed RPC proxy — public Solana endpoints rate-limit/403 per-IP, which
  // silently emptied the cross-chain token list.
  const solanaAdapter = account?.walletAdapter as
    | { chainNamespace?: ChainNamespace; connection?: SolanaRpcConnection }
    | undefined;
  const solanaConnection = solanaAdapter?.chainNamespace === ChainNamespace.solana
    ? solanaAdapter.connection
    : undefined;

  const flow = useCrossDepositFlow();

  const { tokens: oneClickTokensRaw } = useTokens(jwtToken);
  const { quote: dryQuote, loading: quoteLoading, error: quoteError, fetchQuote, reset: resetQuote } =
    useQuote(jwtToken);
  const { status: swapStatus, error: statusError, startPolling } = useSwapStatus(jwtToken);

  const [crossToken, setCrossToken] = useState<OneClickToken | null>(null);
  const [crossQuantity, setCrossQuantity] = useState("");
  const [activeQuote, setActiveQuote] = useState<QuoteResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manualRefund, setManualRefund] = useState("");
  const manualRefundRef = useRef<string>(manualRefund);
  manualRefundRef.current = manualRefund;

  const chainBlockchain =
    CHAIN_ID_TO_BLOCKCHAIN[state.currentChain?.id ?? 0] ?? "";

  const chainTokens = useMemo(
    () => oneClickTokensRaw.filter((t) => t.blockchain === chainBlockchain),
    [oneClickTokensRaw, chainBlockchain],
  );

  const { balances } = useOnchainBalances(
    walletAddress,
    chainBlockchain,
    chainTokens,
    chainBlockchain === "sol" ? solanaConnection : undefined,
  );

  // only show cross-chain tokens the user actually holds a balance of,
  // on the currently connected chain, that aren't already native collateral
  const oneClickTokens = useMemo(() => {
    if (!walletAddress) return [];
    const nativeSymbols = new Set(
      (state.sourceTokens ?? [])
        .map((t) => (t.symbol ?? "").toUpperCase())
        .filter(Boolean),
    );
    return chainTokens
      .filter((t) => {
        if (t.symbol === "USDC") return false;
        if (nativeSymbols.has(t.symbol.toUpperCase())) return false;
        return Number(balances[t.assetId] ?? 0) > 0;
      })
      .map((t) => toOneClickToken(t, balances[t.assetId]));
  }, [chainTokens, balances, walletAddress, state.sourceTokens]);

  const mergedSourceTokens = useMemo(
    () => [...(state.sourceTokens ?? []), ...oneClickTokens] as API.TokenInfo[],
    [state.sourceTokens, oneClickTokens],
  );

  // if the selected cross-chain token is no longer offered (chain switched,
  // balance gone, or it became natively supported), reset to native list
  useEffect(() => {
    if (!crossToken) return;
    const stillOffered = oneClickTokens.some(
      (t) => t.oneClickAssetId === crossToken.oneClickAssetId,
    );
    if (!stillOffered) {
      setCrossToken(null);
      setCrossQuantity("");
      setActiveQuote(null);
      resetQuote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneClickTokens]);

  const destToken = useMemo(() => {
    return (
      oneClickTokensRaw.find(
        (t) => t.symbol === "USDC" && t.blockchain === (chainBlockchain || "eth"),
      ) ??
      oneClickTokensRaw.find((t) => t.symbol === "USDC" && t.blockchain === "eth") ??
      null
    );
  }, [oneClickTokensRaw, chainBlockchain]);

  const crossMode = crossToken !== null;

  const rawAmount = useMemo(() => {
    if (!crossToken || !crossQuantity) return "";
    const parsed = parseFloat(crossQuantity);
    if (isNaN(parsed)) return "";
    return (
      BigInt(Math.round(parsed * 1e6)) *
      BigInt(10) ** BigInt((crossToken.decimals ?? 8) - 6)
    ).toString();
  }, [crossToken, crossQuantity]);

  // debounced dry quote for preview
  useEffect(() => {
    if (!crossMode || !rawAmount || !crossToken || !destToken || activeQuote) return;
    const timer = setTimeout(() => {
      fetchQuote(
        {
          originAsset: crossToken.oneClickAssetId,
          destinationAsset: destToken.assetId,
          amount: rawAmount,
          recipient: walletAddress ?? "0x0000000000000000000000000000000000000001",
          refundTo: walletAddress ?? "0x0000000000000000000000000000000000000001",
          slippageTolerance,
        },
        true,
      );
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossToken, rawAmount, destToken, crossMode, activeQuote]);

  const needsManualRefund = crossMode
    ? !addressMatchesChain(walletAddress, crossToken.oneClickBlockchain)
    : false;

  const handleSourceTokenChange = useCallback(
    (token: API.TokenInfo | undefined | ((prev: API.TokenInfo | undefined) => API.TokenInfo | undefined)) => {
      if (typeof token === "function" || !token) return;
      const oneClick = token as OneClickToken;
      if (oneClick.oneClickAssetId) {
        setCrossToken(oneClick);
        setCrossQuantity("");
        setActiveQuote(null);
        resetQuote();
      } else {
        setCrossToken(null);
        setActiveQuote(null);
        resetQuote();
        state.onSourceTokenChange(token);
      }
    },
    [state, resetQuote],
  );

  const onCrossDeposit = useCallback(async () => {
    if (!crossToken || !rawAmount || !destToken || !walletAddress) return;
    const refundTo = needsManualRefund ? manualRefundRef.current || walletAddress : walletAddress;
    await flow.start({
      originAssetId: crossToken.oneClickAssetId,
      originSymbol: crossToken.symbol ?? crossToken.oneClickAssetId,
      originBlockchain: crossToken.oneClickBlockchain,
      originContractAddress: crossToken.contractAddress ?? null,
      originDecimals: crossToken.decimals ?? 8,
      rawAmount,
      destAssetId: destToken.assetId,
      walletAddress,
      refundAddress: refundTo,
      slippageTolerance,
      jwtToken,
      srcChainId: state.currentChain?.id,
      usdcAddress: state.targetToken?.address,
      usdcDecimals: state.targetToken?.decimals,
    });
  }, [crossToken, rawAmount, destToken, walletAddress, needsManualRefund, flow, slippageTolerance, jwtToken, state.currentChain, state.targetToken]);

  const preview = dryQuote?.quote;
  const swapPrice = useMemo(() => {
    if (!preview || !rawAmount) return 0;
    const out = parseFloat(preview.amountOut);
    const inn = parseFloat(rawAmount);
    return inn > 0 ? out / inn : 0;
  }, [preview, rawAmount]);

  const overrides = useMemo<Partial<DepositFormScriptReturn>>(() => {
    const base: Partial<DepositFormScriptReturn> = {
      sourceTokens: mergedSourceTokens,
      onSourceTokenChange: handleSourceTokenChange,
    };
    if (!crossMode || !crossToken) return base;
    return {
      ...base,
      sourceToken: crossToken as unknown as API.TokenInfo,
      quantity: crossQuantity,
      onQuantityChange: setCrossQuantity,
      // neutralize all state derived from the previously selected native
      // token — the SDK script still computes these for its internal token
      maxQuantity: crossToken.balance ?? "0",
      maxDepositAmount: crossToken.balance ?? "0",
      hintMessage: undefined,
      inputStatus: undefined,
      targetInputStatus: undefined,
      targetHintMessage: undefined,
      balanceRevalidating: false,
      batchBalancesRevalidating: false,
      showSourceDepositCap: false,
      showTargetDepositCap: false,
      quantityNotional: undefined,
      collateralRatio: 0,
      collateralContributionQuantity: 0,
      currentLTV: 0,
      nextLTV: 0,
      fee: { dstGasFee: "0", feeQty: "0", feeAmount: "0", dp: 0 },
      targetQuantity: preview?.amountOutFormatted ?? "",
      targetQuantityLoading: quoteLoading,
      needSwap: true,
      swapPrice,
      swapMinReceived: preview?.minAmountOut,
      warningMessage: quoteError ?? undefined,
      disabled:
        !crossQuantity ||
        !preview ||
        !!quoteError ||
        submitting ||
        !!activeQuote,
      loading: submitting,
      actionType: 0 as const,
      onDeposit: onCrossDeposit,
    };
  }, [
    crossMode,
    crossToken,
    mergedSourceTokens,
    handleSourceTokenChange,
    crossQuantity,
    preview,
    quoteLoading,
    swapPrice,
    quoteError,
    submitting,
    activeQuote,
    onCrossDeposit,
  ]);

  return {
    state,
    overrides,
    formProps: { ...state, ...overrides } as DepositFormScriptReturn,
    crossMode,
    crossToken,
    destToken,
    walletAddress,
    needsManualRefund,
    manualRefund,
    setManualRefund,
    activeQuote,
    swapStatus: swapStatus as GetExecutionStatusResponse | null,
    statusError,
    flow,
  };
}
