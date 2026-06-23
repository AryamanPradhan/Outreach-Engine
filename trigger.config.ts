import { defineConfig } from "@trigger.dev/sdk/v3";
import { config } from "dotenv";
import { resolve } from "path";

// The Trigger.dev CLI bundles this config and runs it from a temp dir, so
// import.meta.url points outside the project. cwd stays at the project root
// (where `npx trigger.dev dev/deploy` is invoked), so resolve .env from there.
config({ path: resolve(process.cwd(), ".env") });

const projectRef = process.env.TRIGGER_PROJECT_REF;
if (!projectRef) throw new Error("TRIGGER_PROJECT_REF is not set in .env");

export default defineConfig({
  project: projectRef,
  runtime: "node",
  logLevel: "log",
  maxDuration: 900,
  dirs: ["./src/trigger"],
});
