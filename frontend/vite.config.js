import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { validatePublicBuildEnvironment } from "./scripts/public-env.mjs";

export default defineConfig({
  plugins: [react(), {
    name: "planzo-public-build-configuration",
    configResolved(config) {
      if (config.command === "build") validatePublicBuildEnvironment(config.env);
    },
  }],
  server: { watch: { ignored: ["**/.cache/**"] } },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
  },
});
