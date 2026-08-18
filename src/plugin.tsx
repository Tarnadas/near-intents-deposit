import React from "react";
import { createInterceptor } from "@orderly.network/plugin-core";
import type { OrderlySDK } from "@orderly.network/plugin-core";
import pkg from "../package.json";
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
      version: pkg.version,
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
                onCloseSheet={
                  typeof (props as { close?: unknown }).close === "function"
                    ? (props as { close: () => void }).close
                    : undefined
                }
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
