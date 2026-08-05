import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const plugins = [
	resolve({ preferBuiltins: true }),
	commonjs(),
	json(),
	typescript({
		tsconfig: "./tsconfig.build.json",
		exclude: ["**/*.test.ts", "**/*.spec.ts"],
	}),
];

const external = ["reflect-metadata", "zod", /^@nestjs\//, /^@wirely\//];

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
];
