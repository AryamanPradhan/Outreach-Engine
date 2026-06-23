import { defineConfig } from "@trigger.dev/sdk/v3";
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, ".env") }); // load .env relative to this file

const projectRef = process.env.TRIGGER_PROJECT_REF;
if (!projectRef) throw new Error("TRIGGER_PROJECT_REF is not set in .env");

export default defineConfig({
  project: projectRef,
  runtime: "node",
  logLevel: "log",
  maxDuration: 900,
  dirs: ["./src/trigger"],
});
