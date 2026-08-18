# @tarnadas/near-intents-deposit

Orderly SDK plugin that adds **automated cross-chain deposits** to the native Deposit form, powered by [NEAR Intents](https://docs.near-intents.org) 1-Click API.

## What it does

The plugin enhances — not replaces — the deposit experience. Users see the same Orderly deposit form they always did:

**EVM and Solana are both supported.** On Solana (chain 900900900, Phantom & co.), the same flow runs: SPL token balances are read via `getTokenAccountsByOwner`, the wallet transfer is a native/SPL transfer signed by the connected Solana wallet, and the final USDC vault deposit goes through Orderly's LayerZero vault program.

1. The source token dropdown is extended with cross-chain tokens the user **actually holds** on their connected chain (on-chain balances are read via public RPC; tokens already supported as native collateral are deduped by symbol)
2. Selecting a native token → the normal deposit path runs unchanged
3. Selecting a cross-chain token (e.g. ARB, SOL, BTC) → a fully automated multi-step flow:
   - Live quote preview while typing ("You'll receive ~X USDC")
   - **Step 1** — quote accepted, wallet asks to transfer the tokens to a 1-Click deposit address (one signature)
   - **Step 2** — NEAR Intents solvers execute the swap (live status in the progress modal)
   - **Step 3** — received USDC is automatically deposited into the user's Orderly trading account (approval + vault deposit, one to two signatures)
   - A themed progress modal walks through every step with amounts, live solver status, explorer links, retry on failure, and refund-safety (funds return to the user's address if the swap fails)

No new tabs, no visible mode switch — the cross-chain rail is plumbing, not UI.

## Install

```bash
npm install @tarnadas/near-intents-deposit
```

### Peer dependencies

Provided by any Orderly SDK v3 host app:

- `@orderly.network/ui-transfer`, `@orderly.network/ui`, `@orderly.network/hooks`, `@orderly.network/i18n`, `@orderly.network/types`, `@orderly.network/plugin-core` `>= 3.0.0`
- `react`, `react-dom` `>= 18`
- `@solana/web3.js` `>= 1.95`, `@solana/spl-token` `>= 0.3.9 <0.4` (already present in hosts with Solana wallet support)

## Integrate

```tsx
import { OrderlyAppProvider } from "@orderly.network/react-app";
import { registerNearIntentsDepositPlugin } from "@tarnadas/near-intents-deposit";
import "@tarnadas/near-intents-deposit/dist/styles.css";

<OrderlyAppProvider
  brokerId="your-broker-id"
  brokerName="your-broker-name"
  plugins={[
    registerNearIntentsDepositPlugin({
      // Optional — waives the 0.2% 1-Click platform fee.
      // Get a token at https://partners.near-intents.org
      jwtToken: import.meta.env.VITE_1CLICK_JWT,
    }),
  ]}
>
```

Environment fallback: `options.jwtToken` → `VITE_1CLICK_JWT` / `NEXT_PUBLIC_1CLICK_JWT` → unauthenticated (0.2% fee).

### Plugin options

```ts
interface NearIntentsSwapOptions {
  /** CSS class for the widget wrapper */
  className?: string;
  /** 1-Click JWT for fee-free swaps */
  jwtToken?: string;
  /** Slippage tolerance in basis points (default: 100 = 1%) */
  slippageTolerance?: number;
}
```

## Architecture

| Layer | File | Role |
|-------|------|------|
| Interceptor | `plugin.tsx` | Replaces the `Deposit.DepositForm` render with the integrated widget |
| Script | `integratedDeposit.script.tsx` | Calls the SDK's own `useDepositFormScript`; merges balance-gated 1-Click tokens into the source list; overrides form state in cross-chain mode |
| Flow | `crossDepositFlow.ts` | The deposit state machine: quote → wallet transfer → solve polling → (approval) → vault deposit, with fire-once ref latches and error extraction |
| Modal | `flowModal.tsx` | Themed progress dialog built on `SimpleDialog` + `--oui-*` CSS variables |
| Balances | `hooks/useOnchainBalances.ts` | Native + ERC20 balance reads via JSON-RPC (public endpoints, chunked) |
| 1-Click | `hooks/useTokens.ts`, `useQuote.ts`, `useSwapStatus.ts` | 1-Click API: tokens, dry/real quotes, status polling |

### Interceptor target

`Deposit.DepositForm` — the stock Orderly deposit form renders with an extended token list; only the source dropdown reveals anything changed.

## Important notes

- **No testnet**: NEAR Intents runs on mainnet only. Test with small amounts.
- **Vite dev hosts**: when consuming the plugin via `file:` / symlink, ensure `@orderly.network/*` resolves to the host's copies — add `resolve.alias` / `dedupe` entries pointing at the host's `node_modules/@orderly.network/*`. Otherwise duplicate React contexts cause `configStore is not defined` errors.
- **Fee policy**: without a JWT, 1-Click applies a 0.2% platform fee; solver execution itself takes 1–5 min cross-chain.
- **Security**: never hardcode JWTs in client code for production.

## Publish / submit to the Builders Marketplace

```bash
pnpm build          # tsup (cjs+esm+dts) + tailwind css
npm publish         # public package
orderly-devkit login
orderly-devkit submit --dry-run
orderly-devkit submit
```

The manifest (`.orderly-manifest.json`) carries `npmName`, `pluginId`, `repoUrl`, `tags`, and `usagePrompt` (agent-facing integration steps). Submission triggers an Orderly security review before the listing goes live.

## Development

```bash
pnpm install
pnpm dev      # watch build
pnpm build    # production build → dist/
```

## License

MIT
