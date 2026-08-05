import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url).pathname;

function read(file: string): string {
	return readFileSync(`${root}${file}`, "utf8");
}

function manifest(): Record<string, unknown> {
	const parsed: unknown = JSON.parse(read("package.json"));
	if (typeof parsed !== "object" || parsed === null) throw new Error("the manifest is not an object");
	return { ...parsed };
}

function exportsMap(): Record<string, unknown> {
	const value = manifest().exports;
	if (typeof value !== "object" || value === null) throw new Error("the manifest declares no exports");
	return { ...value };
}

/**
 * The matchers are only usable if three files agree: the manifest has to publish the
 * subpath, rollup has to build it, and the source has to exist. Any one of them missing
 * fails at a consumer's install rather than here, which is the wrong place to find out.
 */
describe("@nestjs-adk/testing subpaths", () => {
	it("publishes the matchers under their own subpath", () => {
		const matchers = exportsMap()["./matchers"];

		expect(matchers).toEqual({
			types: "./dist/matchers.d.ts",
			import: "./dist/matchers.mjs",
			require: "./dist/matchers.cjs",
		});
	});

	it("builds that subpath from its own entry", () => {
		const rollup = read("rollup.config.mjs");

		expect(rollup).toContain('input: "src/matchers.ts"');
		expect(rollup).toContain("dist/matchers.mjs");
		expect(rollup).toContain("dist/matchers.cjs");
	});

	it("marks the matchers entry as having side effects, because importing it registers them", () => {
		expect(manifest().sideEffects).toEqual(["./dist/matchers.mjs", "./dist/matchers.cjs"]);
	});

	it("keeps the root entry free of that side effect, so a scripted model costs nothing", () => {
		expect(read("src/index.ts")).not.toContain("matchers");
	});
});
