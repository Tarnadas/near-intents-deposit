# @orderly.network/plugin-template

Template project for creating a new Orderly SDK plugin. It comes with:

- **Plugin registration**: exports a `registerPlugin()` factory using `createInterceptor` from `@orderly.network/plugin-core`
- **3-layer widget architecture**: widget wrapper → business logic hook → pure UI component
- **i18n integration**: external locale loading powered by `@orderly.network/i18n`
- **Style build pipeline**: uses `tailwindcss` to build `dist/styles.css`

## Installation

```bash
pnpm add @orderly.network/your-plugin-name
```

This template declares the following peerDependencies (must be provided by the host app):

- `@orderly.network/hooks >= 2.10.1`
- `@orderly.network/i18n >= 2.10.1`
- `@orderly.network/plugin-core >= 2.10.1`
- `@orderly.network/ui >= 2.10.1`
- `react >= 18`
- `react-dom >= 18`

## Exports

- **`registerOrderlyPlugin(options)`**: Plugin registration function, pass to `OrderlyPluginProvider.plugins`
- **`LocaleProvider`**: i18n provider component
- **`OrderlyPluginTemplateOptions`**: TypeScript interface for plugin options

### Using the plugin

```tsx
import { registerOrderlyPlugin } from "@orderly.network/your-plugin-name";
import { OrderlyPluginProvider } from "@orderly.network/ui";

function App() {
  return (
    <OrderlyPluginProvider plugins={[registerOrderlyPlugin({ className: "..." })]}>
      <TradingPage />
    </OrderlyPluginProvider>
  );
}
```

### Using the i18n provider

`LocaleProvider` is implemented on top of `ExternalLocaleProvider` from `@orderly.network/i18n`:

```tsx
import { LocaleProvider } from "@orderly.network/your-plugin-name";

export function Root() {
  return <LocaleProvider>{/* your widget here */}</LocaleProvider>;
}
```

## Styles & build

```bash
pnpm build
```

This runs `tsup` to build the TypeScript and `tailwindcss` to build `dist/styles.css`.

## Using with the Orderly CLI

Generate a new plugin from this template:

```bash
npx @orderly.network/cli create plugin --pluginId myplugin-a1b2c3 --template default
```

The CLI will replace handlebars placeholders (`near-intents-swap`, `NearIntentsSwap`, etc.) with your provided values.

## Template structure

```
src/
  index.tsx                  ← Plugin entry, registerPlugin factory
  types/
    plugin.ts               ← Plugin options interface
  components/
    pluginWidget/
      index.ts              ← Widget barrel export
      pluginWidget.widget.tsx   ← Layer 1: Widget wrapper
      pluginWidget.script.tsx   ← Layer 2: Business logic hook
      pluginWidget.ui.tsx       ← Layer 3: Pure UI component
  i18n/
    index.ts                ← Re-export LocaleProvider
    provider.tsx            ← Wraps ExternalLocaleProvider
    module.ts               ← LocaleMessages + type
    locales/
      en.json               ← Default locale
  tailwind.css
```

## Development

```bash
pnpm dev    # Watch mode
pnpm build  # Production build
```
