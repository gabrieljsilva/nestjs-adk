import {
	AgentResult,
	AgentRunStatus,
	ContextSnapshot,
	EmbeddingVector,
	PrefixComparator,
	Similarity,
} from "@nestjs-adk/core";
import { expect } from "vitest";
import { TestAgent } from "./bed/test-agent.double";
import { JudgeRubric } from "./judge/judge-rubric.value-object";
import type { LlmJudge } from "./judge/llm-judge.service";
import { ScriptedModel } from "./model/scripted-model.double";
import { TestingEmbedder } from "./model/testing-embedder.double";
import { RecordedRun } from "./recording/recorded-run.value-object";
import { RunEvents } from "./recording/run-events.value-object";
import { ToolFake } from "./tool-fake.double";

const embedder = new TestingEmbedder();
const similarity = new Similarity();

interface MatcherResult {
	pass: boolean;
	message: () => string;
}

function readEvents(received: unknown): RunEvents | undefined {
	if (received instanceof RunEvents) return received;
	if (received instanceof RecordedRun) return received.events;
	if (received instanceof TestAgent) return undefined;
	return undefined;
}

function describeTools(events: RunEvents): string {
	const run = events.toolsRun;
	return run.length === 0 ? "none" : run.join(", ");
}

function matchesArgs(actual: Readonly<Record<string, unknown>>, expected: Record<string, unknown>): boolean {
	return Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
}

/**
 * The assertions this package adds, registered by importing `@nestjs-adk/testing/matchers`.
 * Each reads the run's events, so the same assertion holds against a script and a provider.
 */
export const adkMatchers = {
	toHaveRunTool(received: unknown, tool: string, args?: Record<string, unknown>): MatcherResult {
		const events = readEvents(received);
		if (events === undefined) {
			return { pass: false, message: () => "toHaveRunTool expects a RecordedRun or RunEvents." };
		}
		const calls = events.callsTo(tool).filter((call) => call.hasRun);
		const matched = args === undefined ? calls : calls.filter((call) => matchesArgs(call.args, args));
		const wanted = args === undefined ? "" : ` with ${JSON.stringify(args)}`;
		const otherwise =
			calls.length > 0 && matched.length === 0
				? ` It ran with ${calls.map((call) => JSON.stringify(call.args)).join(", ")}.`
				: "";
		return {
			pass: matched.length > 0,
			message: () => `expected ${tool}${wanted} to have run. Tools that ran: ${describeTools(events)}.${otherwise}`,
		};
	},

	toHaveRequestedTool(received: unknown, tool: string): MatcherResult {
		const events = readEvents(received);
		if (events === undefined) {
			return { pass: false, message: () => "toHaveRequestedTool expects a RecordedRun or RunEvents." };
		}
		const requested = events.toolsRequested;
		return {
			pass: requested.includes(tool),
			message: () =>
				`expected ${tool} to have been requested. Requested: ${requested.length === 0 ? "none" : requested.join(", ")}.`,
		};
	},

	toHaveDeniedTool(received: unknown, tool: string): MatcherResult {
		const events = readEvents(received);
		if (events === undefined) {
			return { pass: false, message: () => "toHaveDeniedTool expects a RecordedRun or RunEvents." };
		}
		return {
			pass: events.denied(tool) > 0,
			message: () => `expected ${tool} to have been denied. Tools that ran: ${describeTools(events)}.`,
		};
	},

	toHaveTransferredTo(received: unknown, agent: string): MatcherResult {
		const events = readEvents(received);
		if (events === undefined) {
			return { pass: false, message: () => "toHaveTransferredTo expects a RecordedRun or RunEvents." };
		}
		const transfers = events.transfers;
		return {
			pass: transfers.includes(agent),
			message: () =>
				`expected a transfer to ${agent}. Transfers: ${transfers.length === 0 ? "none" : transfers.join(", ")}.`,
		};
	},

	toHaveDelegatedTo(received: unknown, agent: string): MatcherResult {
		const events = readEvents(received);
		if (events === undefined) {
			return { pass: false, message: () => "toHaveDelegatedTo expects a RecordedRun or RunEvents." };
		}
		const delegations = events.delegations;
		return {
			pass: delegations.includes(agent),
			message: () =>
				`expected a delegation to ${agent}. Delegations: ${delegations.length === 0 ? "none" : delegations.join(", ")}.`,
		};
	},

	toAwaitApproval(received: unknown, tool?: string): MatcherResult {
		if (!(received instanceof AgentResult)) {
			return { pass: false, message: () => "toAwaitApproval expects an AgentResult." };
		}
		const awaiting = received.awaiting.map((call) => call.toolName);
		const suspended = received.status.equals(AgentRunStatus.SUSPENDED);
		return {
			pass: suspended && (tool === undefined || awaiting.includes(tool)),
			message: () =>
				`expected the run to be waiting for approval${tool === undefined ? "" : ` on ${tool}`}. ` +
				`Status: ${received.status.name}. Waiting on: ${awaiting.length === 0 ? "nothing" : awaiting.join(", ")}.`,
		};
	},

	toHaveStatus(received: unknown, status: string): MatcherResult {
		if (!(received instanceof AgentResult)) {
			return { pass: false, message: () => "toHaveStatus expects an AgentResult." };
		}
		return {
			pass: received.status.name === status,
			message: () => `expected the run to be ${status}, and it is ${received.status.name}.`,
		};
	},

	toHaveBeenCalledWithArgs(received: unknown, args: Record<string, unknown>): MatcherResult {
		if (!(received instanceof ToolFake)) {
			return { pass: false, message: () => "toHaveBeenCalledWithArgs expects a ToolFake." };
		}
		const calls = received.calls;
		return {
			pass: calls.some((call) => matchesArgs(call.args, args)),
			message: () =>
				`expected ${received.toolName} to have been called with ${JSON.stringify(args)}. ` +
				`Calls: ${calls.length === 0 ? "none" : calls.map((call) => JSON.stringify(call.args)).join(", ")}.`,
		};
	},

	toBeFullyPlayed(received: unknown): MatcherResult {
		const script = received instanceof TestAgent ? received.script : received;
		if (!(script instanceof ScriptedModel)) {
			return { pass: false, message: () => "toBeFullyPlayed expects a ScriptedModel or a scripted TestAgent." };
		}
		return {
			pass: script.pending === 0,
			message: () => `expected the script to be fully played, and ${script.pending} turn(s) were never reached.`,
		};
	},

	async toBeSemanticallyCloseTo(received: unknown, expected: string, minimum = 0.8): Promise<MatcherResult> {
		if (typeof received !== "string") {
			return { pass: false, message: () => "toBeSemanticallyCloseTo expects a string." };
		}
		const score = similarity.cosine(await embedder.embed(received), await embedder.embed(expected));
		return {
			pass: score >= minimum,
			message: () => `expected a similarity of at least ${minimum} with "${expected}", and it scored ${score.toFixed(2)}.`,
		};
	},

	toBeSimilarTo(received: unknown, expected: EmbeddingVector, minimum = 0.8): MatcherResult {
		if (!(received instanceof EmbeddingVector) || !(expected instanceof EmbeddingVector)) {
			return { pass: false, message: () => "toBeSimilarTo expects two EmbeddingVector instances." };
		}
		const score = similarity.cosine(received, expected);
		return {
			pass: score >= minimum,
			message: () => `expected a cosine similarity of at least ${minimum}, and it scored ${score.toFixed(2)}.`,
		};
	},

	toHaveStablePrefix(received: unknown, minimum: number): MatcherResult {
		if (
			!Array.isArray(received) ||
			received.length < 2 ||
			!received.every((snapshot) => snapshot instanceof ContextSnapshot)
		) {
			return {
				pass: false,
				message: () => "toHaveStablePrefix expects at least two ContextSnapshot instances, one from each run.",
			};
		}
		if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1) {
			return { pass: false, message: () => "toHaveStablePrefix expects a threshold between 0 and 1." };
		}

		const report = new PrefixComparator().compare(received);
		const percentage = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
		const divergence = report.divergence;
		const details =
			divergence === undefined
				? ""
				: ` First divergence: ${divergence.segment} at character ${divergence.offset} ` +
					`(segment character ${divergence.segmentOffset}); contexts continue with ${divergence.excerpts
						.map((excerpt) => JSON.stringify(excerpt))
						.join(", ")}.`;

		return {
			pass: report.ratio >= minimum,
			message: () =>
				`expected a stable prefix of at least ${percentage(minimum)}, and ${percentage(report.ratio)} ` +
				`was stable (${report.prefixCharacters}/${report.totalCharacters} characters).${details}`,
		};
	},

	async toSatisfyRubric(received: unknown, judge: LlmJudge, criteria: string | JudgeRubric): Promise<MatcherResult> {
		if (typeof received !== "string") {
			return { pass: false, message: () => "toSatisfyRubric expects a string." };
		}
		const rubric = criteria instanceof JudgeRubric ? criteria : new JudgeRubric(criteria);
		const verdict = await judge.judge(received, rubric);
		return {
			pass: verdict.passed,
			message: () => `expected the answer to satisfy "${rubric.criteria}". Scored ${verdict.score}: ${verdict.reason}`,
		};
	},
};

expect.extend(adkMatchers);

declare module "vitest" {
	interface Matchers<T> {
		toHaveRunTool(tool: string, args?: Record<string, unknown>): T;
		toHaveRequestedTool(tool: string): T;
		toHaveDeniedTool(tool: string): T;
		toHaveTransferredTo(agent: string): T;
		toHaveDelegatedTo(agent: string): T;
		toAwaitApproval(tool?: string): T;
		toHaveStatus(status: string): T;
		toHaveBeenCalledWithArgs(args: Record<string, unknown>): T;
		toBeFullyPlayed(): T;
		toBeSemanticallyCloseTo(expected: string, minimum?: number): Promise<T>;
		toBeSimilarTo(expected: EmbeddingVector, minimum?: number): T;
		toHaveStablePrefix(minimum: number): T;
		toSatisfyRubric(judge: LlmJudge, criteria: string | JudgeRubric): Promise<T>;
	}
}
