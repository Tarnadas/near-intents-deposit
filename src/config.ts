import { OpenAPI } from "@defuse-protocol/one-click-sdk-typescript";

export const ONE_CLICK_BASE_URL = "https://1click.chaindefuser.com";

export function configureOneClick(jwtToken?: string): void {
  OpenAPI.BASE = ONE_CLICK_BASE_URL;

  const token =
    jwtToken ??
    (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string> }).env
      ? ((import.meta as { env?: Record<string, string> }).env as Record<string, string>)[
          "VITE_1CLICK_JWT"
        ] ??
        ((import.meta as { env?: Record<string, string> }).env as Record<string, string>)[
          "NEXT_PUBLIC_1CLICK_JWT"
        ]
      : undefined);

  if (token) {
    OpenAPI.TOKEN = token;
  }
}

export const DEFAULT_SLIPPAGE = 100;
export const QUOTE_DEADLINE_MS = 3 * 60 * 1000;
export const STATUS_POLL_INTERVAL_MS = 5_000;
