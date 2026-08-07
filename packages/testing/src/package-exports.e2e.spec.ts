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

	/**
	 * The surface a consumer writes a test against.
	 *
	 * A piece that exists and is not exported is a piece nobody can use, and that is not
	 * something a type error catches: the package still builds, and the import fails at the
	 * consumer.
	 */
	it("publishes everything a test is written with", () => {
		const barrel = read("src/index.ts");

		for (const symbol of [
			"AdkTestBed",
			"AdkTestBedBuilder",
			"TestAgent",
			"RecordedRun",
			"RecordedToolCall",
			"RunEvents",
			"RunRecorder",
			"RunTranscript",
			"RoutingModelResolver",
			"ScriptedModel",
			"ScriptedTurn",
			"ToolFake",
			"AgentStub",
			"RecordingModel",
			"TestImage",
			"TestingEmbedder",
			"LlmJudge",
			"JudgeRubric",
			"JudgeVerdict",
			"SessionStorageContractSuite",
		]) {
			expect(barrel).toContain(`export { ${symbol} }`);
		}
	});

	/**
	 * The suite is only useful to somebody outside this repository, and it is only reachable
	 * if it holds nothing the core keeps to itself. A deep import here would compile in the
	 * monorepo and fail at an install, where the paths it reaches do not exist.
	 */
	it("writes the contract suite against the published core, like an adapter downstream", () => {
		const suite = read("src/session-storage-contract-suite.ts");

		expect(suite).toContain('from "@nestjs-adk/core"');
		expect(suite).not.toMatch(/from "\.\.\/\.\./);
	});

	it("publishes every failure a test can be handed", () => {
		const barrel = read("src/index.ts");

		for (const error of [
			"ScriptDeviationError",
			"ScriptExhaustedError",
			"ScriptMisuseError",
			"ScriptNotConsumedError",
			"NothingAwaitingError",
			"UnknownTestAgentError",
			"UnscriptedAgentError",
		]) {
			expect(barrel).toContain(`export { ${error} }`);
		}
	});
});
