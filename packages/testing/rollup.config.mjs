import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const external = ["reflect-metadata", "zod", "vitest", /^@nestjs\//, /^@nestjs-adk\//, /^node:/];

const plugins = [
	resolve({ preferBuiltins: true }),
	commonjs(),
	json(),
	typescript({ tsconfig: "./tsconfig.build.json", exclude: ["**/*.test.ts", "**/*.spec.ts"] }),
];

export default [
	{
		input: "src/index.ts",
		output: [
			{ file: "dist/index.cjs", format: "cjs", sourcemap: false },
			{ file: "dist/index.mjs", format: "es", sourcemap: false },
		],
		external,
		plugins,
	},
	{
		// entry com side effect (expect.extend) — importado via '@nestjs-adk/testing/matchers'
		input: "src/matchers.ts",
		output: [
			{ file: "dist/matchers.cjs", format: "cjs", sourcemap: false },
			{ file: "dist/matchers.mjs", format: "es", sourcemap: false },
		],
		external,
		plugins,
	},
];
