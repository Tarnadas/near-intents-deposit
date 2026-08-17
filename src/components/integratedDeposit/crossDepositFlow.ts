import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useDeposit } from "@orderly.network/hooks";
import { ChainNamespace } from "@orderly.network/types";
import type { QuoteResponse, GetExecutionStatusResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { Transaction, SystemProgram, PublicKey, Connection } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { useQuote } from "../../hooks/useQuote";
import { useSwapStatus } from "../../hooks/useSwapStatus";
import { DEFAULT_SLIPPAGE } from "../../config";

export type FlowStep =
  | "idle"
  | "quoting"
  | "awaiting_signature"
  | "transfer_sent"
  | "solving"
  | "approving"
  | "depositing"
  | "done"
  | "failed";
// note: "approving" still exists internally (wallet popup during approval),
// but the modal renders it as part of the depositing step

type LegPhase =
  | "idle"
  | "checking"
  | "wait_quantity"
  | "approving"
  | "ready"
  | "sent";

export interface CrossDepositFlowParams {
  originAssetId: string;
  originSymbol: string;
  /** 1-Click blockchain of the origin asset (e.g. "eth", "sol") */
  originBlockchain: string;
  originContractAddress: string | null;
  originDecimals: number;
  rawAmount: string;
  destAssetId: string;
  walletAddress: string;
  refundAddress: string;
  slippageTolerance?: number;
  jwtToken?: string;
  srcChainId?: number;
  usdcAddress?: string;
  usdcDecimals?: number;
}

export interface CrossDepositFlowState {
  step: FlowStep;
  error: string | null;
  quote: QuoteResponse | null;
  swapStatus: GetExecutionStatusResponse | null;
  receivedAmount: string | null;
  needsApproval: boolean;
  start: (params: CrossDepositFlowParams) => Promise<void>;
  retryCurrentStep: () => Promise<void>;
  reset: () => void;
}

const MINIMAL_ERC20_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const TERMINAL_SWAP_STATES = new Set(["SUCCESS", "REFUNDED", "FAILED"]);

/** Fallback: derive a human amount from raw units (6dp heuristic for USDC). */
function trimRawToHuman(raw?: string, _assetId?: string): string | null {
  if (!raw) return null;
  const num = BigInt(raw);
  const base = 1_000_000n; // USDC-family decimals
  const whole = num / base;
  const frac = (num % base).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Extract a human message from arbitrary wallet/rpc errors: Error instances,
 * parsed ethers error objects ({ reason, code, shortMessage }), nested
 * { error: { message } } shapes, and plain rejection codes.
 */
function extractErrorMessage(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    if ("code" in err && (err as { code?: string }).code === "ACTION_REJECTED") {
      return "You rejected the request in your wallet";
    }
    return err.message || null;
  }
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (e.code === "ACTION_REJECTED" || e.code === 4001) {
      return "You rejected the request in your wallet";
    }
    const reason =
      (typeof e.shortMessage === "string" && e.shortMessage) ||
      (typeof e.reason === "string" && e.reason) ||
      (typeof e.message === "string" && e.message);
    if (reason) {
      if (/user rejected|rejected the request/i.test(reason)) {
        return "You rejected the request in your wallet";
      }
      return reason;
    }
    if (e.error) return extractErrorMessage(e.error);
    try {
      return JSON.stringify(err).slice(0, 200);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The Orderly DefaultSolanaWalletAdapter's private provider — wallet-connector
 * feeds it the wallet-adapter-react signing functions on connect
 * (`provider: { signMessage, signTransaction, sendTransaction, rpcUrl, ... }`),
 * so it is the same Phantom-backed signer the host itself uses. The adapter
 * exposes no public signTransaction, and importing useWallet() from the plugin
 * resolves a duplicate WalletContext (the host's CJS connector inlines its own
 * copy) which yields wallet=null — hence this route instead.
 */
export interface SolanaWalletLike {
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  sendTransaction?: (transaction: Transaction, connection?: Connection) => Promise<string>;
}

/**
 * Confirm via HTTP polling only. web3.js confirmTransaction(blockheight-
 * strategy) opens a websocket signature subscription — the Orderly RPC proxy
 * endpoint is HTTP-only, so that path spams failed wss handshakes and polls
 * until the blockhash expires.
 */
async function pollSignatureConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs = 60_000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Transaction confirmation timed out — please retry");
    }
    const resp = await connection
      .getSignatureStatus(signature)
      .catch(() => null);
    const value = resp?.value;
    if (value) {
      if (value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
      }
      if (
        value.confirmationStatus === "confirmed" ||
        value.confirmationStatus === "finalized"
      ) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function executeSolanaTransfer(
  connection: Connection,
  wallet: SolanaWalletLike | null | undefined,
  params: CrossDepositFlowParams,
  depositAddress: string,
): Promise<void> {
  const fromPubkey = new PublicKey(params.walletAddress);
  const toPubkey = new PublicKey(depositAddress);
  const amount = BigInt(params.rawAmount);

  const tx = new Transaction();
  if (params.originContractAddress) {
    // SPL token: transfer between ATAs, creating the destination ATA
    // idempotently in case the solver did not pre-fund it
    const mint = new PublicKey(params.originContractAddress);
    const sourceAta = getAssociatedTokenAddressSync(mint, fromPubkey);
    const destAta = getAssociatedTokenAddressSync(mint, toPubkey, true);
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(fromPubkey, destAta, toPubkey, mint),
      createTransferInstruction(sourceAta, destAta, fromPubkey, amount, [], TOKEN_PROGRAM_ID),
    );
  } else {
    tx.add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports: amount }));
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPubkey;

  let signature: string;
  if (typeof wallet?.signTransaction === "function") {
    const signed = await wallet.signTransaction(tx);
    signature = await connection.sendRawTransaction(signed.serialize());
  } else if (typeof wallet?.sendTransaction === "function") {
    // wallets without detached signing (e.g. mobile wallet adapter)
    signature = await wallet.sendTransaction(tx, connection);
  } else {
    throw new Error("The connected Solana wallet does not support signing transactions");
  }
  await pollSignatureConfirmation(connection, signature);
}

export function useCrossDepositFlow(): CrossDepositFlowState {
  const [step, setStep] = useState<FlowStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [receivedAmount, setReceivedAmount] = useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);

  const { fetchQuote } = useQuote();
  const { status: swapStatus, error: statusError, startPolling } = useSwapStatus();
  const { account } = useAccount();

  // second leg: USDC deposit into the trading account. Chain/token config is
  // held in state so the hook re-initializes before the leg runs.
  const [legChainId, setLegChainId] = useState<number | undefined>();
  const [legUsdcAddress, setLegUsdcAddress] = useState<string | undefined>();
  const [legUsdcDecimals, setLegUsdcDecimals] = useState<number | undefined>();

  const usdcDeposit = useDeposit({
    srcChainId: legChainId,
    srcToken: "USDC",
    dstToken: "USDC",
    address: legUsdcAddress,
    decimals: legUsdcDecimals,
  });

  // staged deposit leg state
  const [legPhase, setLegPhase] = useState<LegPhase>("idle");
  const [legAmount, setLegAmount] = useState<string | null>(null);

  const paramsRef = useRef<CrossDepositFlowParams | null>(null);
  const swapStatusRef = useRef(swapStatus);
  swapStatusRef.current = swapStatus;

  const refreshVisibleBalances = useCallback(() => {
    // SWR revalidates on window focus — dispatch one so every balance query
    // in the deposit form re-fetches without reopening the dialog
    try {
      window.dispatchEvent(new Event("focus"));
    } catch {
      /* noop */
    }
  }, []);

  const sendToDepositAddress = useCallback(async (activeQuote: QuoteResponse) => {
    const params = paramsRef.current;
    if (!params || !activeQuote?.quote?.depositAddress) return;

    const walletAdapter = account.walletAdapter;
    const from = params.walletAddress;
    if (!walletAdapter) {
      setStep("failed");
      setError("Wallet not connected");
      return;
    }

    // the Solana adapter only supports the vault deposit method; route
    // generic transfers through the wallet-adapter-react wallet
    const isSolana =
      walletAdapter.chainNamespace === ChainNamespace.solana ||
      params.originBlockchain === "sol";

    try {
      setStep("awaiting_signature");
      if (isSolana) {
        const adapter = walletAdapter as {
          connection?: Connection;
          _provider?: SolanaWalletLike;
        };
        const connection = adapter.connection;
        const wallet = adapter._provider;
        if (!connection) {
          setStep("failed");
          setError("Solana connection unavailable — please reconnect your wallet");
          return;
        }
        if (typeof wallet?.signTransaction !== "function" && typeof wallet?.sendTransaction !== "function") {
          setStep("failed");
          setError("The connected Solana wallet does not support signing transactions — please reconnect it");
          return;
        }
        await executeSolanaTransfer(
          connection,
          wallet,
          params,
          activeQuote.quote.depositAddress,
        );
      } else if (params.originContractAddress) {
        await walletAdapter.sendTransaction(
          params.originContractAddress,
          "transfer",
          {
            from,
            // the provider uses payload.to as the tx recipient
            to: params.originContractAddress,
            data: [activeQuote.quote.depositAddress, params.rawAmount],
            value: 0n,
          },
          { abi: MINIMAL_ERC20_ABI },
        );
      } else {
        // native token: plain value transfer to the deposit address
        await walletAdapter.sendTransaction(
          activeQuote.quote.depositAddress,
          "",
          {
            from,
            to: activeQuote.quote.depositAddress,
            data: [],
            value: BigInt(params.rawAmount),
          },
          { abi: [] },
        );
      }
      setStep("transfer_sent");
    } catch (err: unknown) {
      setStep("failed");
      setError(extractErrorMessage(err) ?? "Transfer was rejected");
    }
  }, [account.walletAdapter]);

  const start = useCallback(
    async (params: CrossDepositFlowParams) => {
      paramsRef.current = params;
      setLegChainId(params.srcChainId);
      setLegUsdcAddress(params.usdcAddress);
      setLegUsdcDecimals(params.usdcDecimals);
      setLegPhase("idle");
      setLegAmount(null);
      setNeedsApproval(false);
      depositFiredRef.current = false;
      approveFiredRef.current = false;
      setError(null);
      setQuote(null);
      setReceivedAmount(null);
      setStep("quoting");

      const result = await fetchQuote(
        {
          originAsset: params.originAssetId,
          destinationAsset: params.destAssetId,
          amount: params.rawAmount,
          recipient: params.walletAddress,
          refundTo: params.refundAddress,
          slippageTolerance: params.slippageTolerance ?? DEFAULT_SLIPPAGE,
        },
        false,
      );

      if (!result?.quote?.depositAddress) {
        setStep("failed");
        setError("Failed to obtain a quote — try again later");
        return;
      }

      setQuote(result);
      await sendToDepositAddress(result);

      if (result.quote.depositAddress) {
        startPolling(result.quote.depositAddress, result.quote.depositMemo);
      }
    },
    [fetchQuote, sendToDepositAddress, startPolling],
  );

  // transition: transfer_sent -> solving once the swap status is known
  useEffect(() => {
    if (step === "transfer_sent" && swapStatus) {
      setStep("solving");
    }
  }, [swapStatus, step]);

  // transition: solving -> start the deposit leg on SUCCESS
  useEffect(() => {
    const status = swapStatusRef.current;
    if (step === "solving" && status && TERMINAL_SWAP_STATES.has(status.status)) {
      if (status.status === "SUCCESS") {
        // amountOut is raw base units — the deposit hook's quantity must be
        // the human-readable amount (it runs parseUnits internally)
        const humanAmount =
          status.swapDetails?.amountOutFormatted ??
          trimRawToHuman(status.swapDetails?.amountOut, status.quoteResponse?.quoteRequest?.destinationAsset);
        console.debug("[flow] swap SUCCESS", {
          raw: status.swapDetails?.amountOut,
          humanAmount,
          legChainId,
          legUsdcAddress,
          legUsdcDecimals,
        });
        if (!humanAmount) {
          setStep("failed");
          setError("Swap succeeded but no output amount reported");
          return;
        }
        setReceivedAmount(humanAmount);
        // USDC just landed in the wallet — refresh balances before depositing
        refreshVisibleBalances();
        setLegAmount(humanAmount);
        setLegPhase("checking");
      } else {
        setStep("failed");
        setError(
          status.status === "REFUNDED"
            ? "Swap was refunded to your refund address"
            : "Swap failed — funds refunded to your refund address",
        );
      }
    }
  }, [swapStatus, step, refreshVisibleBalances, legChainId, legUsdcAddress, legUsdcDecimals]);

  // staged deposit leg: wait until the deposit hook has re-initialized with
  // the leg's chain/token config (first renders run with undefined state),
  // then apply the quantity
  useEffect(() => {
    if (legPhase !== "checking" || !legAmount) return;
    const missing =
      legChainId === undefined ? "legChainId"
      : !legUsdcAddress ? "legUsdcAddress"
      : !legUsdcDecimals ? "legUsdcDecimals"
      : null;
    if (missing) {
      console.debug("[flow] checking gate: waiting for", missing);
      return;
    }
    console.debug("[flow] checking gate passed", {
      legChainId,
      dstChainId: usdcDeposit.dst?.chainId,
    });
    // wait one render past config application so useDeposit's memos settled
    usdcDeposit.setQuantity(legAmount);
    setLegPhase("wait_quantity");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legPhase, legAmount, legChainId, legUsdcAddress, legUsdcDecimals, usdcDeposit.dst?.chainId]);

  // quantity applied — decide approval vs direct deposit. Requires the hook
  // to hold a real vault address (derived from chain config) before we trust
  // its allowance read; otherwise we'd compare against garbage.
  useEffect(() => {
    if (legPhase !== "wait_quantity" || !legAmount) return;
    if (usdcDeposit.quantity !== legAmount) {
      console.debug("[flow] wait_quantity gate: quantity mismatch", {
        quantity: usdcDeposit.quantity,
        legAmount,
      });
      return;
    }
    const vault = usdcDeposit.targetChain?.network_infos?.vault_address;
    if (!vault) {
      console.debug("[flow] wait_quantity gate: no vault_address yet", {
        targetChain: usdcDeposit.targetChain,
      });
      return;
    }

    const allowanceNum = Number(usdcDeposit.allowance ?? "0");
    console.debug("[flow] approval decision", {
      vault,
      allowance: usdcDeposit.allowance,
      legAmount,
      needsApproval: Number(legAmount) > allowanceNum,
    });
    if (Number(legAmount) > allowanceNum) {
      setNeedsApproval(true);
      setLegPhase("approving");
      setStep("approving"); // wallet popup for the approval tx
    } else {
      setLegPhase("ready");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legPhase, legAmount, usdcDeposit.quantity, usdcDeposit.allowance, usdcDeposit.targetChain]);

  // approval (skipped when allowance already sufficient) — approve() resolves
  // after waiting for the approval tx, so proceed straight to depositing.
  // Ref-latched for the same identity-mutation reason as the deposit effect.
  const approveFiredRef = useRef(false);
  useEffect(() => {
    if (legPhase !== "approving" || !legAmount) return;
    if (approveFiredRef.current) return;
    approveFiredRef.current = true;
    console.debug("[flow] approve() invoked", { legAmount });
    (async () => {
      try {
        await usdcDeposit.approve(legAmount);
        console.debug("[flow] approve() resolved");
        setLegPhase("ready");
      } catch (err: unknown) {
        console.debug("[flow] approve() rejected", err);
        setStep("failed");
        setError(extractErrorMessage(err) ?? "Approval failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legPhase, legAmount]);

  // fire the actual vault deposit. Once the tx is submitted ("sent") the
  // effect must never re-run: the hook mutates its SWR state after settling
  // (allowance/fee refresh), whose identity changes would cancel the pending
  // success handler and freeze the modal. A ref latches the fired state.
  const depositFiredRef = useRef(false);
  useEffect(() => {
    if (legPhase !== "ready" || !legAmount) return;
    if (usdcDeposit.quantity !== legAmount) return;
    if (depositFiredRef.current) return;
    // the vault reverts with ZeroDepositFee() when fee=0 — the hook's fee
    // query is keyed on quantity and may still hold its initial 0n state;
    // wait for a real fee before invoking the signer
    if (usdcDeposit.depositFeeRevalidating) {
      console.debug("[flow] ready gate: fee revalidating");
      return;
    }
    const fee = usdcDeposit.depositFee ?? 0n;
    if (fee <= 0n) {
      console.debug("[flow] ready gate: waiting for nonzero depositFee", {
        quantity: usdcDeposit.quantity,
      });
      // fail loudly instead of spinning forever if the fee query never lands
      const stall = setTimeout(() => {
        setStep("failed");
        setError("Could not fetch the deposit fee — please retry");
      }, 30_000);
      return () => clearTimeout(stall);
    }
    depositFiredRef.current = true;
    setLegPhase("sent");
    setStep("depositing");
    console.debug("[flow] deposit() invoked", {
      quantity: usdcDeposit.quantity,
      depositFee: fee.toString(),
      vault: usdcDeposit.targetChain?.network_infos?.vault_address,
    });
    (async () => {
      try {
        // guard against the hook silently hanging (e.g. stuck RPC read in
        // enquireAllowance) — surface it instead of an eternal spinner
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Deposit request timed out — please retry")), 60_000),
        );
        const result = await Promise.race([usdcDeposit.deposit(), timeout]);
        console.debug("[flow] deposit() resolved", result);
        setStep("done");
        refreshVisibleBalances();
      } catch (err: unknown) {
        console.debug("[flow] deposit() rejected", err);
        setStep("failed");
        setError(extractErrorMessage(err) ?? "Deposit failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legPhase, legAmount, usdcDeposit.quantity, usdcDeposit.depositFee, usdcDeposit.depositFeeRevalidating]);

  // surface status polling errors
  useEffect(() => {
    if (statusError && (step === "solving" || step === "transfer_sent")) {
      setStep("failed");
      setError(statusError);
    }
  }, [statusError, step]);

  const retryCurrentStep = useCallback(async () => {
    const current = step;
    const activeQuote = quote;
    setError(null);
    if ((current === "awaiting_signature" || current === "transfer_sent") && activeQuote) {
      setStep("idle");
      await sendToDepositAddress(activeQuote);
      if (activeQuote.quote?.depositAddress) {
        startPolling(activeQuote.quote.depositAddress, activeQuote.quote.depositMemo);
      }
      return;
    }
    if (current === "approving" || current === "depositing") {
      setLegPhase("checking");
      return;
    }
    if (paramsRef.current) {
      await start(paramsRef.current);
    }
  }, [step, quote, sendToDepositAddress, start, startPolling]);

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setQuote(null);
    setReceivedAmount(null);
    setLegPhase("idle");
    setLegAmount(null);
    setNeedsApproval(false);
    depositFiredRef.current = false;
    approveFiredRef.current = false;
    paramsRef.current = null;
  }, []);

  return {
    step,
    error,
    quote,
    swapStatus,
    receivedAmount,
    needsApproval,
    start,
    retryCurrentStep,
    reset,
  };
}
