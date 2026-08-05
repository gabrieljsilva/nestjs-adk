import {
	AdkEmbedder,
	ContextCollector,
	type ContextSnapshot,
	type PrefixReport,
	type RunResult,
	Similarity,
	cacheHitRatio,
	comparePrefix,
} from "@nestjs-adk/core";
import { expect } from "vitest";

const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
/** Snapshot of the FIRST model call: it holds instruction + tools, and is built before any tool result. */
const FIRST_CALL = 0;

interface ToolCallView {
	tool: string;
	args: unknown;
}

function toolCalls(run: RunResult): ToolCallView[] {
	return run.events
		.filter((event) => event.type === "tool_call")
		.map((event) => ("tool" in event ? { tool: event.tool, args: event.args } : { tool: "?", args: undefined }));
}

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function describeCalls(calls: ToolCallView[]): string {
	if (calls.length === 0) return "(no tool called)";
	return calls.map((call, index) => `  ${index + 1}. ${call.tool}(${JSON.stringify(call.args)})`).join("\n");
}

function percent(ratio: number): string {
	return `${(ratio * 100).toFixed(1)}%`;
}

/** Misuse and misconfiguration THROW instead of failing: a `pass:false` would quietly satisfy `.not`. */
function assertUsable(runs: RunResult[], matcher: string, hint: string, threshold: number): void {
	if (!Array.isArray(runs) || runs.length < 2) throw new Error(`${matcher} ${hint}`);
	if (!(threshold >= 0 && threshold <= 1)) {
		throw new Error(`${matcher} takes a ratio between 0 and 1, received ${threshold}.`);
	}
}

/**
 * First model call of each run. Only that call is compared, because it holds the instruction and the
 * tool catalog and is built before any tool result, and it always belongs to the root agent, since
 * sub-agents can only be reached later in the loop.
 */
function firstCallSnapshots(runs: RunResult[]): ContextSnapshot[] {
	const collector = ContextCollector.getActive();
	if (!collector) {
		throw new Error(
			"Context diagnostics are off. Enable AdkModule.forRoot({ diagnostics: true }) to capture the context.",
		);
	}

	return runs.map((run, index) => {
		const first = collector.snapshotsOf(run)?.[FIRST_CALL];
		if (!first) throw new Error(`Run #${index + 1} has no captured context; only runs started by ask() are tracked.`);
		return first;
	});
}

function describeDivergence(report: PrefixReport): string {
	const divergence = report.divergesAt;
	if (!divergence) return "The contexts are byte-identical.";
	const excerpts = divergence.excerpts.map((excerpt, index) => `  run #${index + 1}: ${JSON.stringify(excerpt)}`);
	return (
		`Diverges in "${divergence.segment}" at offset ${divergence.segmentOffset} of the segment ` +
		`(${divergence.offset} of the context):\n${excerpts.join("\n")}`
	);
}

expect.extend({
	toHaveCalledTool(received: RunResult, tool: string, args?: unknown) {
		const calls = toolCalls(received);
		const pass = calls.some((call) => call.tool === tool && (args === undefined || this.equals(call.args, args)));
		return {
			pass,
			message: () =>
				`Expected ${pass ? "NOT " : ""}to find a call to "${tool}"${args !== undefined ? ` with args ${JSON.stringify(args)}` : ""}.\nTool calls of the run:\n${describeCalls(calls)}`,
		};
	},

	toHaveCalledToolTimes(received: RunResult, tool: string, times: number) {
		const count = toolCalls(received).filter((call) => call.tool === tool).length;
		return {
			pass: count === times,
			message: () =>
				`Expected "${tool}" to be called ${times}x, was called ${count}x.\nTool calls of the run:\n${describeCalls(toolCalls(received))}`,
		};
	},

	async toBeSemanticallySimilarTo(received: string | RunResult, expected: string, options?: { threshold?: number }) {
		const actual = typeof received === "string" ? received : received.text;
		const threshold = options?.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;

		// Always the module-configured embedder: both texts MUST be embedded by the same model.
		const embedder = AdkEmbedder.getActive();
		const { embeddings, usage } = await embedder.embed([actual, expected]);
		const similarity = new Similarity().cosine(embeddings[0] ?? [], embeddings[1] ?? []);

		const pass = similarity >= threshold;
		return {
			pass,
			message: () =>
				`Expected the text to be ${pass ? "LESS" : "at least"} ${threshold} semantically similar ` +
				`(cosine similarity: ${similarity.toFixed(4)}; embedding input tokens: ${usage.promptTokens}).\n` +
				`Actual:   ${actual}\nExpected: ${expected}`,
		};
	},

	toHavePausedForApproval(received: RunResult, tool?: string) {
		const pending = received.pending ?? [];
		const paused = received.status === "pending_approval";
		const pass = paused && (tool === undefined || pending.some((entry) => entry.tool === tool));
		return {
			pass,
			message: () =>
				`Expected the run ${pass ? "NOT " : ""}to be paused awaiting approval${tool ? ` of "${tool}"` : ""}. ` +
				`Status: "${received.status}"; pending: [${pending.map((entry) => entry.tool).join(", ") || "none"}].`,
		};
	},

	toHaveUsedAtMostTokens(received: RunResult, max: number) {
		const total = received.usage.totalTokens;
		return {
			pass: total <= max,
			message: () =>
				`Expected the run to use at most ${max} tokens, used ${total} ` +
				`(in=${received.usage.promptTokens} out=${received.usage.outputTokens}).`,
		};
	},

	toMatchOutput(received: RunResult, schema: { safeParse(value: unknown): { success: boolean; error?: unknown } }) {
		const value = received.output ?? tryParseJson(received.text);
		const result = schema.safeParse(value);
		return {
			pass: result.success,
			message: () =>
				result.success
					? "Expected the run output NOT to match the schema, but it did."
					: `Run output does not match the schema.\nOutput: ${JSON.stringify(value)}\nIssues: ${JSON.stringify(result.error)}`,
		};
	},

	toHaveStablePrefix(received: RunResult[], threshold: number) {
		assertUsable(
			received,
			"toHaveStablePrefix",
			"compares runs: pass at least 2 RunResults, e.g. expect([runA, runB]).",
			threshold,
		);

		const report = comparePrefix(firstCallSnapshots(received));
		const pass = report.ratio >= threshold;
		return {
			pass,
			message: () =>
				`Expected the stable prefix to be ${pass ? "BELOW" : "at least"} ${percent(threshold)}, got ${percent(report.ratio)} ` +
				`(${report.prefixChars} of ${report.totalChars} chars, comparing the first model call of each run).\n${describeDivergence(report)}`,
		};
	},

	toHaveCacheHitRatioAbove(received: RunResult[], threshold: number) {
		assertUsable(
			received,
			"toHaveCacheHitRatioAbove",
			"needs a sequence of runs: the first one warms the cache, e.g. expect([warmUp, runA, runB]).",
			threshold,
		);

		const report = cacheHitRatio(received.map((run) => run.usage));
		if (!report.available) {
			throw new Error(
				"The provider reported no cached tokens for any measured run, so cache usage is UNKNOWN; this is not 0%. " +
					"Check that the model supports context caching and reports it in usage metadata.",
			);
		}

		const silent = report.silentRuns > 0 ? `; ${report.silentRuns} run(s) left out for reporting nothing` : "";
		const pass = report.ratio >= threshold;
		return {
			pass,
			message: () =>
				`Expected the cache hit ratio to be ${pass ? "BELOW" : "at least"} ${percent(threshold)}, got ${percent(report.ratio)} ` +
				`(${report.cachedTokens} cached of ${report.promptTokens} prompt tokens across ${report.sampledRuns} run(s), excluding the warm-up${silent}).`,
		};
	},

	toHaveCalledToolsInOrder(received: RunResult, tools: string[]) {
		const calls = toolCalls(received).map((call) => call.tool);
		let cursor = 0;
		for (const call of calls) {
			if (call === tools[cursor]) cursor++;
			if (cursor === tools.length) break;
		}
		const pass = cursor === tools.length;
		return {
			pass,
			message: () =>
				`Expected the subsequence [${tools.join(" → ")}] to be ${pass ? "absent" : "present"} in the tool calls.\nActual order: [${calls.join(" → ")}]`,
		};
	},
});

declare module "vitest" {
	interface Assertion<T> {
		toHaveCalledTool(tool: string, args?: unknown): T;
		toHaveCalledToolTimes(tool: string, times: number): T;
		toHaveCalledToolsInOrder(tools: string[]): T;
		toHavePausedForApproval(tool?: string): T;
		toHaveUsedAtMostTokens(max: number): T;
		toMatchOutput(schema: { safeParse(value: unknown): { success: boolean; error?: unknown } }): T;
		toBeSemanticallySimilarTo(expected: string, options?: { threshold?: number }): Promise<T>;
		toHaveStablePrefix(threshold: number): T;
		toHaveCacheHitRatioAbove(threshold: number): T;
	}
	interface AsymmetricMatchersContaining {
		toHaveCalledTool(tool: string, args?: unknown): void;
		toHaveCalledToolTimes(tool: string, times: number): void;
		toHaveCalledToolsInOrder(tools: string[]): void;
		toHavePausedForApproval(tool?: string): void;
		toHaveUsedAtMostTokens(max: number): void;
		toMatchOutput(schema: { safeParse(value: unknown): { success: boolean; error?: unknown } }): void;
		toHaveStablePrefix(threshold: number): void;
		toHaveCacheHitRatioAbove(threshold: number): void;
	}
}
