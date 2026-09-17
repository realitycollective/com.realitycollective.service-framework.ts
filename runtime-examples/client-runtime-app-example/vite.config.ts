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
    // The aliases below point into ../../packages, so Vite would resolve their
    // `import "react"` from the framework folder and pick up the REPO ROOT copy,
    // while this app's own code uses its local copy. Two React instances in one
    // bundle leaves the hook dispatcher null and every component throws
    // "Cannot read properties of null (reading 'useMemo')". Force one copy.
    dedupe: ["react", "react-dom"],
    alias: {
      "@realitycollective/service-framework": fileURLToPath(new URL("./service-framework/dist/index.js", frameworkRoot)),
      "@realitycollective/service-framework-react": fileURLToPath(new URL("./service-framework-react/dist/index.js", frameworkRoot)),
      "@realitycollective/service-framework-three": fileURLToPath(new URL("./service-framework-three/dist/index.js", frameworkRoot)),
      "@realitycollective/service-framework-client": fileURLToPath(new URL("./service-framework-client/dist/index.js", frameworkRoot))
    }
  },
  server: {
    https: true,
    host: "0.0.0.0",
    port: 5173
  },
  preview: {
    https: true,
    host: "0.0.0.0",
    port: 4173
  }
});

