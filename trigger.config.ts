import { defineConfig } from "@trigger.dev/sdk/v3";
import { config } from "dotenv";

config(); // load .env so TRIGGER_PROJECT_REF is available locally

const projectRef = process.env.TRIGGER_PROJECT_REF;
if (!projectRef) throw new Error("TRIGGER_PROJECT_REF is not set in .env");

export default defineConfig({
  project: projectRef,
  runtime: "node",
  logLevel: "log",
  maxDuration: 900,
  dirs: ["./src/trigger"],
});
