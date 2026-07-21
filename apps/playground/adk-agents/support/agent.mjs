// Entry point consumed by `adk web` (API.md §6 — createAdkEntry).
// Imports the PRE-COMPILED playground (tsc emits decorator metadata; the devtools'
// esbuild doesn't — that's why this file is plain JS, run with --compile false).
// createRequire: everything through the CJS build — avoids the dual-package hazard (the
// AgentRunner class from index.mjs ≠ index.cjs would break DI).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAdkEntry } = require("@nestjs-adk/google");
const { AppModule } = require("../../dist/app.module.js");
const { SupportAgent } = require("../../dist/support/support.agent.js");

export const rootAgent = await createAdkEntry(AppModule, SupportAgent);
