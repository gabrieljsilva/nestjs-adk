import { resolve } from "node:path";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@nestjs-adk/testing/matchers": resolve(__dirname, "packages/testing/src/matchers.ts"),
			"@nestjs-adk/testing": resolve(__dirname, "packages/testing/src/index.ts"),
			"@nestjs-adk/core": resolve(__dirname, "packages/core/src/index.ts"),
			"@nestjs-adk/mcp": resolve(__dirname, "packages/mcp/src/index.ts"),
			"@nestjs-adk/google": resolve(__dirname, "packages/google/src/index.ts"),
		},
	},
	test: {
		// include comes from each project in vitest.workspace.ts (unit | integration | agents)
		globals: true,
		root: "./",
		exclude: ["**/node_modules/**", "**/dist/**"],
		hookTimeout: 30000,
		coverage: {
			reporter: ["text", "html"],
			provider: "v8",
			include: ["packages/*/src/**", "apps/*/src/**"],
			exclude: [
				"**/dist/**",
				"**/*.spec.ts",
				"**/main.ts",
				// type-only files: SWC emits an empty module and v8 reports it as 0% — nothing to test
				"packages/core/src/lib/types/events.ts",
				"packages/core/src/lib/types/options.ts",
				"packages/core/src/lib/types/resolved-agent.ts",
				"packages/core/src/lib/types/tool-context.ts",
				"packages/core/src/lib/module/adk-options.ts",
			],
		},
	},
	plugins: [
		// SWC no lugar do esbuild: necessário para emitDecoratorMetadata (DI do NestJS em testes)
		swc.vite({ module: { type: "es6" } }),
	],
});
