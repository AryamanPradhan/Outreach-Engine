import { defineConfig } from "@trigger.dev/sdk/v3";

// The project ref is a public project identifier, not a secret — Trigger.dev
// expects it inline here. It must be present at build time, including on the
// cloud build server where .env (gitignored) does not exist. Runtime secrets
// (API keys) are configured in the Trigger.dev dashboard, not in this file.
export default defineConfig({
  project: "proj_hsbjwofvuxlcgxvvbozi",
  runtime: "node",
  logLevel: "log",
  maxDuration: 900,
  dirs: ["./src/trigger"],
});
