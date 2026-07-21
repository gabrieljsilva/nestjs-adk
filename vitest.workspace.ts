import { defineWorkspace } from "vitest/config";

const EXCLUDED = ["**/node_modules/**", "**/dist/**"];

// Three suites, selected by file naming convention:
// - unit:        *.spec.ts — in-process, scripted engine/model, no external dependencies
// - integration: *.e2e.spec.ts — full Nest app or external processes (e.g. MCP stdio server)
// - agents:      *.agent.spec.ts — REAL LLM calls (needs GEMINI_API_KEY); never runs on `npm run test`
export default defineWorkspace([
	{
		extends: "./vitest.config.ts",
		test: {
			name: "unit",
			include: ["**/*.spec.ts"],
			exclude: [...EXCLUDED, "**/*.e2e.spec.ts", "**/*.agent.spec.ts"],
		},
	},
	{
		extends: "./vitest.config.ts",
		test: {
			name: "integration",
			include: ["**/*.e2e.spec.ts"],
			exclude: EXCLUDED,
		},
	},
	{
		extends: "./vitest.config.ts",
		test: {
			name: "agents",
			include: ["**/*.agent.spec.ts"],
			exclude: EXCLUDED,
		},
	},
]);
