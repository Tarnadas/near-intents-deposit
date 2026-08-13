import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: ["src/index.tsx"],
  format: ["esm", "cjs"],
  target: "es2020",
  // minify: !options.watch,
  splitting: true,
  sourcemap: true,
  treeshake: true,
  clean: !options.watch,
  dts: true,
  external: ["react", "react-dom"],
  esbuildOptions(esOptions, context) {
    if (!options.watch) {
      esOptions.drop = ["console", "debugger"];
    }
  },
}));
