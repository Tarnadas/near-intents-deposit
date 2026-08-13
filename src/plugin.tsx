import React from "react";
import { createInterceptor } from "@orderly.network/plugin-core";
import type { OrderlySDK } from "@orderly.network/plugin-core";
import { LocaleProvider } from "./i18n";
import { NearIntentsSwapWidget } from "./components/nearIntentsSwap";
import type { NearIntentsSwapOptions } from "./types/plugin";
import { configureOneClick } from "./config";

export function registerNearIntentsSwapPlugin(options: NearIntentsSwapOptions = {}) {
  const { jwtToken, slippageTolerance, className } = options;

  return (SDK: OrderlySDK) => {
    SDK.registerPlugin({
      id: "near-intents-swap",
      name: "NearIntentsSwap",
      version: "0.0.1",
      orderlyVersion: ">=3.0.0",

      interceptors: [
        createInterceptor(
          "Transfer.DepositAndWithdraw",
          (Original, props, _api) => (
            <>
              <Original {...props} />
              <LocaleProvider>
                <NearIntentsSwapWidget
                  className={className}
                  jwtToken={jwtToken}
                  slippageTolerance={slippageTolerance}
                />
              </LocaleProvider>
            </>
          ),
        ),
      ],

      setup: (_api) => {
        configureOneClick(jwtToken);
      },
    });
  };
}
