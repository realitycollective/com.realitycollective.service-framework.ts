import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const frameworkRoot = new URL("../../packages/", import.meta.url);

export default defineConfig({
  plugins: [
    react(),
    basicSsl()
  ],
  resolve: {
    alias: {
      "@realitycollective/service-framework": fileURLToPath(new URL("./service-framework/dist/index.js", frameworkRoot)),
      "@realitycollective/service-framework-react": fileURLToPath(new URL("./service-framework-react/dist/index.js", frameworkRoot))
    }
  },
  server: {
    https: true,
    host: "0.0.0.0",
    port: 5174
  },
  preview: {
    https: true,
    host: "0.0.0.0",
    port: 4174
  }
});
