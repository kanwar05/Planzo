import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ["**/.cache/**"] } },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
  },
});
