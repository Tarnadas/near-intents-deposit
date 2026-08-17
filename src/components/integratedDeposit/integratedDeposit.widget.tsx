import { memo } from "react";
import type { FC } from "react";
import { DepositForm } from "@orderly.network/ui-transfer";
import { Box, Text, cn } from "@orderly.network/ui";
import { useTranslation } from "@orderly.network/i18n";
import { useIntegratedDepositScript } from "./integratedDeposit.script";
import { FlowModal } from "./flowModal";
import { FlowErrorBoundary } from "./flowErrorBoundary";

export interface IntegratedDepositWidgetProps {
  jwtToken?: string;
  slippageTolerance?: number;
  className?: string;
}

export const IntegratedDepositWidget: FC<IntegratedDepositWidgetProps> = memo(
  (props) => {
    const script = useIntegratedDepositScript({
      jwtToken: props.jwtToken,
      slippageTolerance: props.slippageTolerance,
    });

    const { t } = useTranslation();

    const flowActive = script.flow.step !== "idle";

    return (
      <Box className={cn(props.className)}>
        <DepositForm {...script.formProps} />

        {script.crossMode && script.needsManualRefund && !flowActive && (
          <Box mt={2}>
            <Text size="xs" intensity={54}>
              {t(
                "NearIntentsDeposit.refundAddress",
                "Refund Address (on source chain)",
              )}
            </Text>
            <input
              type="text"
              placeholder="Your address on the source chain"
              value={script.manualRefund}
              onChange={(e) => script.setManualRefund(e.target.value)}
              style={{
                width: "100%",
                marginTop: 4,
                borderRadius: "var(--oui-rounded-lg, 8px)",
                border: "1px solid var(--oui-color-line)",
                background: "var(--oui-color-base-5, transparent)",
                padding: "8px 12px",
                fontSize: 13,
                color: "inherit",
                outline: "none",
              }}
            />
          </Box>
        )}

        {flowActive && (
          <FlowErrorBoundary>
            <FlowModal
              flow={script.flow}
              originSymbol={script.crossToken?.symbol ?? ""}
              onDismiss={script.flow.reset}
            />
          </FlowErrorBoundary>
        )}
      </Box>
    );
  },
);

IntegratedDepositWidget.displayName = "IntegratedDepositWidget";
