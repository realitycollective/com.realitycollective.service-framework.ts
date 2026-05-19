import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@realitycollective/service-framework": fileURLToPath(new URL("./packages/service-framework/src/index.ts", import.meta.url)),
      "@realitycollective/service-framework-react": fileURLToPath(new URL("./packages/service-framework-react/src/index.tsx", import.meta.url)),
      "@realitycollective/service-framework-three": fileURLToPath(new URL("./packages/service-framework-three/src/index.ts", import.meta.url)),
      "@realitycollective/service-framework-client": fileURLToPath(new URL("./packages/service-framework-client/src/index.ts", import.meta.url)),
      "@realitycollective/service-framework-babylon": fileURLToPath(new URL("./packages/service-framework-babylon/src/index.ts", import.meta.url))
    }
  },
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      all: true,
      include: [
        "packages/service-framework/src/**/*.js",
        "packages/service-framework-client/src/**/*.{ts,tsx}"
      ],
      exclude: [
        "**/packages/service-framework/src/**/*.ts",
        "**/packages/service-framework-client/src/contracts.ts"
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100
      }
    }
  }
});
