import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // WIP harness only; remove when practicePhase lands.
    exclude: ["tests/minigames/practicePhase.test.ts"],
  },
});
