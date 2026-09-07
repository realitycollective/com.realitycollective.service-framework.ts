import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const frameworkRoot = new URL("../../packages/", import.meta.url);

export default defineConfig({
  resolve: {
    alias: {
      "@realitycollective/service-framework": fileURLToPath(new URL("./service-framework/dist/index.js", frameworkRoot))
    }
  },
  server: { host: "0.0.0.0", port: 5175 },
  preview: { host: "0.0.0.0", port: 4175 }
});
