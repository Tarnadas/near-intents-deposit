import { memo } from "react";
import type { FC, CSSProperties } from "react";
import { SimpleDialog, Text, Flex, Box } from "@orderly.network/ui";
import { useTranslation } from "@orderly.network/i18n";
import type { CrossDepositFlowState, FlowStep } from "./crossDepositFlow";

export interface FlowModalProps {
  flow: CrossDepositFlowState;
  originSymbol: string;
  onDismiss: () => void;
}

const STEPS: { key: string; labelKey: string; defaultLabel: string }[] = [
  { key: "quoting", labelKey: "NearIntentsDeposit.flow.quoting", defaultLabel: "Requesting quote" },
  { key: "awaiting_signature", labelKey: "NearIntentsDeposit.flow.signing", defaultLabel: "Confirm transfer in wallet" },
  { key: "transfer_sent", labelKey: "NearIntentsDeposit.flow.sent", defaultLabel: "Swap in progress" },
  { key: "depositing", labelKey: "NearIntentsDeposit.flow.depositing", defaultLabel: "Deposit USDC to trading account" },
];

const STEP_ORDER: FlowStep[] = [
  "quoting",
  "awaiting_signature",
  "transfer_sent",
  "depositing",
];

function stepRank(step: FlowStep): number {
  if (step === "done") return STEP_ORDER.length;
  if (step === "approving" || step === "solving") return 3;
  const idx = STEP_ORDER.indexOf(step);
  return idx < 0 ? 0 : idx;
}

export const FlowModal: FC<FlowModalProps> = memo(
  ({ flow, originSymbol, onDismiss }) => {
    const { t } = useTranslation();
    const { step, error, quote, swapStatus, receivedAmount } = flow;

    if (step === "idle") return null;

    const failed = step === "failed";
    const done = step === "done";
    const currentRank = stepRank(step);
    const received = swapStatus?.swapDetails?.amountOutFormatted;

    const stepBadgeStyle = (state: "done" | "current" | "error" | "pending"): CSSProperties => ({
      width: 20,
      height: 20,
      borderRadius: "var(--oui-rounded-full, 9999px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 10,
      fontWeight: 700,
      flexShrink: 0,
      color: "#fff",
      background:
        state === "done"
          ? "var(--oui-color-success)"
          : state === "current"
            ? "var(--oui-color-primary)"
            : state === "error"
              ? "var(--oui-color-danger)"
              : "var(--oui-color-base-6, #555)",
    });

    return (
      <SimpleDialog
        open
        onOpenChange={(open) => {
          if (!open && (done || failed)) onDismiss();
        }}
        closable={done || failed}
        size="sm"
        title={
          done
            ? t("NearIntentsDeposit.flow.titleDone", "Deposit complete")
            : failed
              ? t("NearIntentsDeposit.flow.titleFailed", "Deposit failed")
              : t("NearIntentsDeposit.flow.title", "Cross-chain deposit in progress")
        }
        actions={
          failed
            ? {
                primary: {
                  label: t("NearIntentsDeposit.flow.retry", "Retry"),
                  onClick: () => void flow.retryCurrentStep(),
                },
                secondary: {
                  label: t("common.close", "Close"),
                  onClick: () => onDismiss(),
                },
              }
            : done
              ? {
                  primary: {
                    label: t("common.close", "Close"),
                    onClick: () => onDismiss(),
                  },
                }
              : undefined
        }
      >
        <Flex direction="column" gap={1} style={{ width: "100%" }}>
          <Text size="xs" intensity={54}>
            {originSymbol} → USDC →{" "}
            {t("NearIntentsDeposit.flow.tradingAccount", "trading account")}
          </Text>

          <Flex direction="column" gap={2} mt={3} style={{ width: "100%" }}>
            {STEPS.map((s, i) => {
              const isDone = done || (!failed && i < currentRank);
              const isCurrent = !done && !failed && i === currentRank;
              const isError = failed && i === currentRank;
              const state = isDone
                ? "done"
                : isCurrent
                  ? "current"
                  : isError
                    ? "error"
                    : "pending";
              // sub-label for the deposit step: which action is pending
              const subLabel =
                isCurrent && s.key === "depositing"
                  ? step === "approving"
                    ? t("NearIntentsDeposit.flow.approving", "Approve USDC spending …")
                    : step === "depositing"
                      ? t("NearIntentsDeposit.flow.confirmDeposit", "Confirm deposit in wallet …")
                      : t("NearIntentsDeposit.flow.preparing", "Preparing deposit …")
                  : null;
              return (
                <Flex key={s.key} itemAlign="center" gap={2} style={{ width: "100%" }}>
                  <Box style={stepBadgeStyle(state)}>
                    {isDone ? "✓" : isError ? "!" : isCurrent ? "" : i + 1}
                    {isCurrent && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "currentColor",
                          opacity: 0.4,
                        }}
                      />
                    )}
                  </Box>
                  <Flex direction="column" style={{ minWidth: 0 }}>
                    <Text
                      size="xs"
                      intensity={isDone || isCurrent || isError ? 98 : 54}
                    >
                      {t(s.labelKey, s.defaultLabel)}
                    </Text>
                    {subLabel && (
                      <Text size="2xs" intensity={54}>
                        {subLabel}
                      </Text>
                    )}
                  </Flex>
                  {isCurrent && s.key === "transfer_sent" && (
                    <Text size="2xs" intensity={54} style={{ marginLeft: "auto" }}>
                      {swapStatus?.status ?? "…"}
                    </Text>
                  )}
                </Flex>
              );
            })}
          </Flex>

          {(quote?.quote || received) && (
            <Flex
              direction="column"
              gap={1}
              mt={3}
              p={2}
              style={{
                width: "100%",
                borderRadius: "var(--oui-rounded-lg, 8px)",
                background: "var(--oui-color-base-5, #2a2a35)",
              }}
            >
              {quote?.quote?.amountInFormatted && (
                <Flex itemAlign="center" justify="between" style={{ width: "100%" }}>
                  <Text size="2xs" intensity={54}>
                    {t("NearIntentsDeposit.flow.sending", "Sending")}
                  </Text>
                  <Text size="2xs" intensity={98} style={{ marginLeft: 12, whiteSpace: "nowrap" }}>
                    {quote.quote.amountInFormatted} {originSymbol}
                  </Text>
                </Flex>
              )}
              {quote?.quote?.amountOutFormatted && (
                <Flex itemAlign="center" justify="between" style={{ width: "100%" }}>
                  <Text size="2xs" intensity={54}>
                    {t("NearIntentsDeposit.flow.expected", "Expected")}
                  </Text>
                  <Text size="2xs" intensity={98} style={{ marginLeft: 12, whiteSpace: "nowrap" }}>
                    {quote.quote.amountOutFormatted} USDC
                  </Text>
                </Flex>
              )}
              {received && (
                <Flex itemAlign="center" justify="between" style={{ width: "100%" }}>
                  <Text size="2xs" intensity={54}>
                    {t("NearIntentsDeposit.flow.received", "Received")}
                  </Text>
                  <Text
                    size="2xs"
                    style={{ marginLeft: 12, whiteSpace: "nowrap", color: "var(--oui-color-success)" }}
                  >
                    {received} USDC
                  </Text>
                </Flex>
              )}
              {receivedAmount && done && (
                <Flex itemAlign="center" justify="between" style={{ width: "100%" }}>
                  <Text size="2xs" intensity={54}>
                    {t("NearIntentsDeposit.flow.deposited", "Deposited")}
                  </Text>
                  <Text
                    size="2xs"
                    style={{ marginLeft: 12, whiteSpace: "nowrap", color: "var(--oui-color-success)" }}
                  >
                    {receivedAmount} USDC
                  </Text>
                </Flex>
              )}
              {swapStatus?.swapDetails?.destinationChainTxHashes?.[0]
                ?.explorerUrl && (
                <a
                  href={
                    swapStatus.swapDetails.destinationChainTxHashes[0]
                      .explorerUrl
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    color: "var(--oui-color-link)",
                    textDecoration: "none",
                    marginTop: 4,
                  }}
                >
                  {t("NearIntentsDeposit.viewExplorer", "View on Explorer →")}
                </a>
              )}
            </Flex>
          )}

          {error && (
            <Box mt={2} style={{ color: "var(--oui-color-danger)" }}>
              <Text size="xs">{error}</Text>
            </Box>
          )}
        </Flex>
      </SimpleDialog>
    );
  },
);

FlowModal.displayName = "FlowModal";
