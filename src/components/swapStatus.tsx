import { memo } from "react";
import type { FC } from "react";
import type { GetExecutionStatusResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { Box, Text, Flex } from "@orderly.network/ui";
import { useTranslation } from "@orderly.network/i18n";

export interface SwapStatusProps {
  status: GetExecutionStatusResponse | null;
  error: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING_DEPOSIT: "text-yellow-400",
  KNOWN_DEPOSIT_TX: "text-blue-400",
  PROCESSING: "text-blue-400",
  INCOMPLETE_DEPOSIT: "text-orange-400",
  SUCCESS: "text-green-400",
  REFUNDED: "text-orange-400",
  FAILED: "text-red-400",
};

export const SwapStatus: FC<SwapStatusProps> = memo(({ status, error }) => {
  const { t } = useTranslation();

  if (error) {
    return (
      <Box className="oui-rounded-lg oui-bg-red-950/40 oui-p-3">
        <Text className="oui-text-sm oui-text-red-400">{error}</Text>
      </Box>
    );
  }

  if (!status) return null;

  const color = STATUS_COLORS[status.status] ?? "text-base-contrast-80";
  const swap = status.swapDetails;

  return (
    <Box className="oui-rounded-lg oui-bg-base-900/70 oui-p-3">
      <Flex itemAlign="center" justify="between" className="oui-mb-2">
        <Text className="oui-text-xs oui-text-base-contrast-54">
          {t("NearIntentsSwap.status", "Status")}
        </Text>
        <Text className={`oui-text-sm oui-font-semibold ${color}`}>
          {status.status}
        </Text>
      </Flex>
      {swap?.amountOut && (
        <Flex itemAlign="center" justify="between">
          <Text className="oui-text-xs oui-text-base-contrast-54">
            {t("NearIntentsSwap.received", "Received")}
          </Text>
          <Text className="oui-text-sm oui-text-base-contrast">
            {swap.amountOutFormatted ?? swap.amountOut}
          </Text>
        </Flex>
      )}
      {status.status === "SUCCESS" && swap?.destinationChainTxHashes?.[0]?.explorerUrl && (
        <a
          href={swap.destinationChainTxHashes[0].explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="oui-mt-2 oui-block oui-text-xs oui-text-primary hover:oui-underline"
        >
          {t("NearIntentsSwap.viewExplorer", "View on Explorer →")}
        </a>
      )}
    </Box>
  );
});

SwapStatus.displayName = "SwapStatus";
