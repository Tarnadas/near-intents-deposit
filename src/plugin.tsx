import React from "react";
import { createInterceptor } from "@orderly.network/plugin-core";
import type { OrderlySDK } from "@orderly.network/plugin-core";
import { LocaleProvider } from "./i18n";
import { IntegratedDepositWidget } from "./components/integratedDeposit";
import type { NearIntentsDepositOptions } from "./types/plugin";
import { configureOneClick } from "./config";

export function registerNearIntentsDepositPlugin(options: NearIntentsDepositOptions = {}) {
  const { jwtToken, slippageTolerance, className } = options;

  return (SDK: OrderlySDK) => {
    SDK.registerPlugin({
      id: "near-intents-deposit",
      name: "NearIntentsDeposit",
      version: "0.1.0",
      orderlyVersion: ">=3.0.0",

      interceptors: [
        createInterceptor(
          "Deposit.DepositForm",
          (_Original, props, _api) => (
            <LocaleProvider>
              <IntegratedDepositWidget
                jwtToken={jwtToken}
                slippageTolerance={slippageTolerance}
                className={className}
                key={JSON.stringify(props)}
              />
            </LocaleProvider>
          ),
        ),
      ],

      setup: (_api) => {
        configureOneClick(jwtToken);
      },
    });
  };
}
