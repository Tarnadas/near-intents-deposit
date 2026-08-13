import { memo, useMemo } from "react";
import type { FC } from "react";
import type { TokenResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { Text } from "@orderly.network/ui";

export interface TokenSelectProps {
  tokens: TokenResponse[];
  value: string;
  onChange: (assetId: string) => void;
  disabled?: boolean;
}

export const TokenSelect: FC<TokenSelectProps> = memo(
  ({ tokens, value, onChange, disabled }) => {
    const selected = useMemo(
      () => tokens.find((t) => t.assetId === value),
      [tokens, value],
    );

    return (
      <div className="relative">
        <select
          className="oui-w-full oui-appearance-none oui-rounded-lg oui-border oui-border-base-30 oui-bg-base-800 oui-px-3 oui-py-2 oui-text-sm oui-text-base-contrast oui-outline-none focus:oui-border-primary"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          {tokens.length === 0 && (
            <option value="">Loading tokens...</option>
          )}
          {tokens.map((token) => (
            <option key={token.assetId} value={token.assetId}>
              {token.symbol} ({token.blockchain.toUpperCase()})
            </option>
          ))}
        </select>
        {selected && (
          <Text className="oui-pointer-events-none oui-absolute oui-right-3 oui-top-1/2 oui--translate-y-1/2 oui-text-xs oui-text-base-contrast-54">
            ${selected.price.toFixed(2)}
          </Text>
        )}
      </div>
    );
  },
);

TokenSelect.displayName = "TokenSelect";
