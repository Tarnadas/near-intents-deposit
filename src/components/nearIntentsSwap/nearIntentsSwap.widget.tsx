import { memo, useEffect } from "react";
import type { FC } from "react";
import { NearIntentsSwapUi } from "./nearIntentsSwap.ui";
import { useNearIntentsSwapScript } from "./nearIntentsSwap.script";

export interface NearIntentsSwapWidgetProps {
  className?: string;
  jwtToken?: string;
  slippageTolerance?: number;
}

export const NearIntentsSwapWidget: FC<NearIntentsSwapWidgetProps> = memo(
  (props) => {
    const script = useNearIntentsSwapScript({
      jwtToken: props.jwtToken,
      slippageTolerance: props.slippageTolerance,
    });

    return <NearIntentsSwapUi {...script} className={props.className} />;
  },
);

NearIntentsSwapWidget.displayName = "NearIntentsSwapWidget";
