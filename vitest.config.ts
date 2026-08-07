import { resolve } from "node:path";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

process.loadEnvFile(resolve(__dirname, ".env"));

export default defineConfig({
	resolve: {
		alias: {
			"@nestjs-adk/testing/matchers": resolve(__dirname, "packages/testing/src/matchers.ts"),
			"@nestjs-adk/testing": resolve(__dirname, "packages/testing/src/index.ts"),
			"@nestjs-adk/core": resolve(__dirname, "packages/core/src/index.ts"),
			"@nestjs-adk/openai": resolve(__dirname, "packages/openai/src/index.ts"),
			"@nestjs-adk/mcp": resolve(__dirname, "packages/mcp/src/index.ts"),
			"@nestjs-adk/google": resolve(__dirname, "packages/google/src/index.ts"),
		},
	},
	test: {
		globals: true,
		root: "./",
		// Inherited by every project, which then only names what it excludes on top of this.
		exclude: ["**/node_modules/**", "**/dist/**"],
		hookTimeout: 30000,
		// The library and the application that exercises it are separate projects, because they
		// answer different questions and a red one means different things. `unit` and
		// `integration` cover `packages/` and the tooling around it, and neither reaches a
		// provider: everything the library does against a real model is proved through the
		// application, in `playground:agents`, because that is where the public API is the
		// thing under test. A suffix decides the level: `.e2e.spec.ts` boots the whole store,
		// `.ai.spec.ts` spends money, everything else is a unit test.
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["packages/**/*.spec.ts"],
					exclude: ["**/*.e2e.spec.ts", "**/*.ai.spec.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "integration",
					include: ["packages/**/*.e2e.spec.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "playground",
					// The application's own suites, unit and end to end alike: both are free and
					// offline, so there is nothing to gain from running them apart.
					include: ["apps/playground/**/*.spec.ts"],
					exclude: ["**/*.ai.spec.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "playground:agents",
					include: ["apps/playground/**/*.ai.spec.ts"],
					disableConsoleIntercept: true,
					// One file at a time: these talk to a real provider on one key, and four suites
					// at once spend the per minute quota on rate limit errors instead of on answers.
					fileParallelism: false,
				},
			},
		],
		coverage: {
			reporter: ["text", "html"],
			provider: "v8",
			// Coverage follows `npm run test`, which is the library. The application has its own
			// project and measuring it here would report every file it has as untested.
			include: ["packages/*/src/**"],
			exclude: ["**/dist/**", "**/*.spec.ts", "**/*.fixture.ts", "**/main.ts"],
		},
	},
	// Vitest 4 transforms with oxc, which does not emit decorator metadata. SWC does it, so
	// oxc is turned off here rather than left to warn on every run about the esbuild flag
	// the plugin sets for the same reason.
	oxc: false,
	plugins: [
		// SWC no lugar do esbuild: necessário para emitDecoratorMetadata (DI do NestJS em testes)
		swc.vite({ module: { type: "es6" } }),
	],
});
