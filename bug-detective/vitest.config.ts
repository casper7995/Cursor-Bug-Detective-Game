import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // WIP harnesses in the working tree can reference APIs before they land; un-exclude when implemented.
    exclude: [
      "tests/minigames/clueGating.test.ts",
      "tests/minigames/practicePhase.test.ts",
    ],
  },
});
