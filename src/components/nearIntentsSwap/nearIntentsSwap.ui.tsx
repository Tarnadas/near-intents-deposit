import { memo } from "react";
import type { FC } from "react";
import { Box, Flex, Text, cn } from "@orderly.network/ui";
import { useTranslation } from "@orderly.network/i18n";
import { TokenSelect } from "../tokenSelect";
import { SwapStatus } from "../swapStatus";
import type { NearIntentsSwapScriptResult } from "./nearIntentsSwap.script";

export interface NearIntentsSwapUiProps extends NearIntentsSwapScriptResult {
  className?: string;
}

export const NearIntentsSwapUi: FC<NearIntentsSwapUiProps> = memo((props) => {
  const {
    className,
    tokens,
    tokensLoading,
    tokensError,
    originAsset,
    destinationAsset,
    setOriginAsset,
    setDestinationAsset,
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
  } = props;

  const { t } = useTranslation();

  const canSwap = Boolean(
    originAsset && destinationAsset && amount && recipient && phase !== "active",
  );

  const showDryPreview = Boolean(dryQuote?.quote && !activeQuote);
  const showDeposit = Boolean(activeQuote?.quote?.depositAddress);

  return (
    <Box
      className={cn(
        "oui-rounded-xl oui-border oui-border-base-30 oui-bg-base-900/70 oui-p-4 oui-flex oui-flex-col oui-gap-3",
        className,
      )}
    >
      <Text className="oui-text-sm oui-font-semibold oui-text-base-contrast">
        {t("NearIntentsSwap.title", "Cross-Chain Swap")}
      </Text>

      {tokensError && (
        <Text className="oui-text-xs oui-text-red-400">{tokensError}</Text>
      )}

      <Flex direction="column" className="oui-gap-2">
        <Flex direction="column" className="oui-gap-1">
          <Text className="oui-text-xs oui-text-base-contrast-54">
            {t("NearIntentsSwap.from", "From")}
          </Text>
          <div className="oui-flex oui-gap-2">
            <input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="oui-flex-1 oui-rounded-lg oui-border oui-border-base-30 oui-bg-base-800 oui-px-3 oui-py-2 oui-text-sm oui-text-base-contrast oui-outline-none focus:oui-border-primary"
            />
            <div className="oui-w-[180px]">
              <TokenSelect
                tokens={tokens}
                value={originAsset}
                onChange={setOriginAsset}
                disabled={tokensLoading}
              />
            </div>
          </div>
        </Flex>

        <button
          onClick={swapTokens}
          className="oui-mx-auto oui-flex oui-h-7 oui-w-7 oui-items-center oui-justify-center oui-rounded-full oui-border oui-border-base-30 oui-bg-base-800 oui-text-base-contrast-54 hover:oui-bg-base-700"
          aria-label="Swap direction"
        >
          ⇅
        </button>

        <Flex direction="column" className="oui-gap-1">
          <Text className="oui-text-xs oui-text-base-contrast-54">
            {t("NearIntentsSwap.to", "To")}
          </Text>
          <div className="oui-flex oui-gap-2">
            <input
              type="text"
              readOnly
              placeholder={
                dryQuote?.quote?.amountOutFormatted ?? "0.0"
              }
              value={dryQuote?.quote?.amountOutFormatted ?? ""}
              className="oui-flex-1 oui-rounded-lg oui-border oui-border-base-30 oui-bg-base-800 oui-px-3 oui-py-2 oui-text-sm oui-text-base-contrast-80 oui-outline-none"
            />
            <div className="oui-w-[180px]">
              <TokenSelect
                tokens={tokens}
                value={destinationAsset}
                onChange={setDestinationAsset}
                disabled={tokensLoading}
              />
            </div>
          </div>
        </Flex>
      </Flex>

      <Flex direction="column" className="oui-gap-1">
        <Text className="oui-text-xs oui-text-base-contrast-54">
          {t("NearIntentsSwap.recipient", "Recipient Address")}
        </Text>
        <input
          type="text"
          placeholder="0x..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="oui-w-full oui-rounded-lg oui-border oui-border-base-30 oui-bg-base-800 oui-px-3 oui-py-2 oui-text-sm oui-text-base-contrast oui-outline-none focus:oui-border-primary"
        />
      </Flex>

      {showDryPreview && (
        <Box className="oui-rounded-lg oui-bg-base-800/50 oui-p-2">
          <Flex itemAlign="center" justify="between">
            <Text className="oui-text-xs oui-text-base-contrast-54">
              {t("NearIntentsSwap.rate", "Rate")}
            </Text>
            <Text className="oui-text-xs oui-text-base-contrast-80">
              {quoteLoading
                ? "..."
                : `${dryQuote?.quote?.amountOutFormatted ?? "--"}`}
            </Text>
          </Flex>
        </Box>
      )}

      {quoteError && (
        <Text className="oui-text-xs oui-text-red-400">{quoteError}</Text>
      )}

      {showDeposit && activeQuote?.quote?.depositAddress && (
        <Box className="oui-rounded-lg oui-bg-blue-950/30 oui-p-3 oui-flex oui-flex-col oui-gap-2">
          <Text className="oui-text-xs oui-font-semibold oui-text-blue-300">
            {t("NearIntentsSwap.depositInstructions", "Send your tokens to this address")}
          </Text>
          <code className="oui-break-all oui-rounded oui-bg-base-900 oui-p-2 oui-text-xs oui-text-base-contrast">
            {activeQuote.quote.depositAddress}
          </code>
          {activeQuote.quote.depositMemo && (
            <Flex direction="column" className="oui-gap-1">
              <Text className="oui-text-xs oui-text-base-contrast-54">
                {t("NearIntentsSwap.memo", "Memo (required)")}
              </Text>
              <code className="oui-rounded oui-bg-base-900 oui-p-2 oui-text-xs oui-text-base-contrast">
                {activeQuote.quote.depositMemo}
              </code>
            </Flex>
          )}
          <button
            onClick={() => {
              navigator.clipboard?.writeText(activeQuote.quote.depositAddress!);
            }}
            className="oui-mt-1 oui-text-xs oui-text-primary hover:oui-underline"
          >
            {t("NearIntentsSwap.copy", "Copy address")}
          </button>
        </Box>
      )}

      <SwapStatus status={swapStatus} error={statusError} />

      <button
        onClick={handleSwap}
        disabled={!canSwap}
        className={cn(
          "oui-w-full oui-rounded-lg oui-py-2.5 oui-text-sm oui-font-semibold oui-transition-colors",
          canSwap
            ? "oui-bg-primary oui-text-base-0 hover:oui-bg-primary/90"
            : "oui-bg-base-700 oui-text-base-contrast-54 oui-cursor-not-allowed",
        )}
      >
        {phase === "active"
          ? t("NearIntentsSwap.swapping", "Swap in progress...")
          : t("NearIntentsSwap.swapButton", "Swap")}
      </button>
    </Box>
  );
});

NearIntentsSwapUi.displayName = "NearIntentsSwapUi";
