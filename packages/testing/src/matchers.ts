import { AgentResult, AgentRunStatus, Similarity, ToolResultMessage } from "@nestjs-adk/core";
import { expect } from "vitest";
import { JudgeRubric } from "./judge-rubric";
import type { LlmJudge } from "./llm-judge";
import { ScriptedModel } from "./scripted-model";
import { TestAgent } from "./test-agent";
import { TestingEmbedder } from "./testing-embedder";

/** Close enough to count as the same answer, when the caller did not say. */
const DEFAULT_CLOSENESS = 0.8;

const embedder = new TestingEmbedder();
const similarity = new Similarity();

interface MatcherResult {
	pass: boolean;
	message: () => string;
}

function requestsOf(received: unknown): readonly { messages: readonly unknown[] }[] | undefined {
	if (received instanceof ScriptedModel) return received.requests;
	if (received instanceof TestAgent) return received.model.requests;
	return undefined;
}

/** A tool that ran is a tool whose result came back into a later turn's context. */
function toolsRun(received: unknown): readonly string[] {
	const requests = requestsOf(received);
	if (requests === undefined) return [];
	const names = new Set<string>();
	for (const request of requests) {
		for (const message of request.messages) {
			if (message instanceof ToolResultMessage) names.add(message.toolName);
		}
	}
	return [...names];
}

export const adkMatchers = {
	/**
	 * The agent actually ran this tool.
	 *
	 * It reads the results that came back, not the calls that were asked for: a model can
	 * ask for a tool that does not exist, and a run that ended before the call would still
	 * have asked. What came back is what happened.
	 */
	toCallTool(received: unknown, tool: string): MatcherResult {
		if (requestsOf(received) === undefined) {
			return { pass: false, message: () => "toCallTool expects a ScriptedModel or a TestAgent." };
		}
		const run = toolsRun(received);
		return {
			pass: run.includes(tool),
			message: () => `expected ${tool} to have run. Tools that ran: ${run.length === 0 ? "none" : run.join(", ")}.`,
		};
	},

	/** The run stopped and is waiting for a human, optionally on one named tool. */
	toAwaitApproval(received: unknown, tool?: string): MatcherResult {
		if (!(received instanceof AgentResult)) {
			return { pass: false, message: () => "toAwaitApproval expects an AgentResult." };
		}
		const awaiting = received.awaiting.map((call) => call.toolName);
		const suspended = received.status.equals(AgentRunStatus.SUSPENDED);
		const pass = suspended && (tool === undefined || awaiting.includes(tool));
		return {
			pass,
			message: () =>
				`expected the run to be waiting for approval${tool === undefined ? "" : ` on ${tool}`}. ` +
				`Status: ${received.status.name}. Waiting on: ${awaiting.length === 0 ? "nothing" : awaiting.join(", ")}.`,
		};
	},

	/**
	 * Two texts say close enough to the same thing.
	 *
	 * The comparison is the deterministic embedder, so it costs no call and reruns the
	 * same: it catches a rewording, not a paraphrase that shares no words.
	 */
	async toBeSemanticallyCloseTo(
		received: unknown,
		expected: string,
		minimum: number = DEFAULT_CLOSENESS,
	): Promise<MatcherResult> {
		if (typeof received !== "string") {
			return { pass: false, message: () => "toBeSemanticallyCloseTo expects a string." };
		}
		const score = similarity.cosine(await embedder.embed(received), await embedder.embed(expected));
		return {
			pass: score >= minimum,
			message: () => `expected a similarity of at least ${minimum} with "${expected}", and it scored ${score.toFixed(2)}.`,
		};
	},

	/** A model graded the answer against criteria, which is the assertion a rewrite survives. */
	async toSatisfyRubric(received: unknown, judge: LlmJudge, criteria: string | JudgeRubric): Promise<MatcherResult> {
		if (typeof received !== "string") {
			return { pass: false, message: () => "toSatisfyRubric expects a string." };
		}
		const rubric = criteria instanceof JudgeRubric ? criteria : JudgeRubric.of(criteria);
		const verdict = await judge.judge(received, rubric);
		return {
			pass: verdict.passed,
			message: () => `expected the answer to satisfy "${rubric.criteria}". Scored ${verdict.score}: ${verdict.reason}`,
		};
	},
};

expect.extend(adkMatchers);

declare module "vitest" {
	// The parameter is declared without its default on purpose: repeating vitest's own
	// `= any` would be the one place this package erases a type.
	interface Assertion<T> {
		toCallTool(tool: string): T;
		toAwaitApproval(tool?: string): T;
		toBeSemanticallyCloseTo(expected: string, minimum?: number): Promise<T>;
		toSatisfyRubric(judge: LlmJudge, criteria: string | JudgeRubric): Promise<T>;
	}

	interface AsymmetricMatchersContaining {
		toCallTool(tool: string): void;
		toAwaitApproval(tool?: string): void;
	}
}
