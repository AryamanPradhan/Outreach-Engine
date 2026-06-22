import { defineConfig } from "@trigger.dev/sdk/v3";

const PROJECT_REF = process.env.TRIGGER_PROJECT_REF || "your-trigger-project-ref";

if (PROJECT_REF === "your-trigger-project-ref") {
  throw new Error(
    "Set TRIGGER_PROJECT_REF in your environment or replace the placeholder in trigger.config.ts"
  );
}

export default defineConfig({
  project: PROJECT_REF,
  runtime: "node",
  logLevel: "log",
  maxDuration: 900,
  dirs: ["./src/trigger"],
});
