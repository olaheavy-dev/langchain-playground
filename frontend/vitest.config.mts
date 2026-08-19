import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfigPaths so "@/lib/api" resolves in tests exactly as it does in the app.
  resolve: { tsconfigPaths: true },
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["{app,components,lib}/**/*.test.{ts,tsx}"],
  },
});
