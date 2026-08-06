import { AgentResult, AgentRunStatus, Similarity } from "@nestjs-adk/core";
import { expect } from "vitest";
import { JudgeRubric } from "./judge-rubric";
import type { LlmJudge } from "./llm-judge";
import { RecordedRun } from "./recorded-run";
import { RunEvents } from "./run-events";
import { ScriptedModel } from "./scripted-model";
import { TestAgent } from "./test-agent";
import { TestingEmbedder } from "./testing-embedder";
import { ToolFake } from "./tool-fake";

/** Close enough to count as the same answer, when the caller did not say. */
const DEFAULT_CLOSENESS = 0.8;

const embedder = new TestingEmbedder();
const similarity = new Similarity();

interface MatcherResult {
	pass: boolean;
	message: () => string;
}

/**
 * The events behind whatever was handed to a matcher.
 *
 * A run, the bed's own recorder or a plain `RunEvents` all answer the same questions, so a
 * test asserts on the thing it happens to be holding rather than on the one shape a matcher
 * was written for.
 */
function eventsOf(received: unknown): RunEvents | undefined {
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

export const adkMatchers = {
	/**
	 * The agent actually ran this tool, optionally with these arguments.
	 *
	 * It reads the run's own events, so the same assertion holds for a scripted run and for
	 * one a real provider decided. A tool that was asked for and stopped in front of a human
	 * has not run: that is `toAwaitApproval`.
	 */
	toHaveRunTool(received: unknown, tool: string, args?: Record<string, unknown>): MatcherResult {
		const events = eventsOf(received);
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

	/** The model asked for this tool, whether or not it ever ran. */
	toHaveRequestedTool(received: unknown, tool: string): MatcherResult {
		const events = eventsOf(received);
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

	/** A human refused this call, and the conversation carried on knowing it. */
	toHaveDeniedTool(received: unknown, tool: string): MatcherResult {
		const events = eventsOf(received);
		if (events === undefined) {
			return { pass: false, message: () => "toHaveDeniedTool expects a RecordedRun or RunEvents." };
		}
		return {
			pass: events.denied(tool) > 0,
			message: () => `expected ${tool} to have been denied. Tools that ran: ${describeTools(events)}.`,
		};
	},

	/** The session changed hands to this agent. */
	toHaveTransferredTo(received: unknown, agent: string): MatcherResult {
		const events = eventsOf(received);
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

	/** One task was handed to this agent, with the conversation staying where it was. */
	toHaveDelegatedTo(received: unknown, agent: string): MatcherResult {
		const events = eventsOf(received);
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

	/** The run stopped and is waiting for a human, optionally on one named tool. */
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

	/** The run ended in this state, named as the runtime names it. */
	toHaveStatus(received: unknown, status: string): MatcherResult {
		if (!(received instanceof AgentResult)) {
			return { pass: false, message: () => "toHaveStatus expects an AgentResult." };
		}
		return {
			pass: received.status.name === status,
			message: () => `expected the run to be ${status}, and it is ${received.status.name}.`,
		};
	},

	/** A tool double was called with these arguments. */
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

	/** Every turn the script queued was played, so the conversation happened as described. */
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

	/**
	 * Two texts say close enough to the same thing.
	 *
	 * The comparison is the deterministic embedder, so it costs no call and reruns the same:
	 * it catches a rewording, not a paraphrase that shares no words.
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
		toSatisfyRubric(judge: LlmJudge, criteria: string | JudgeRubric): Promise<T>;
	}

	interface AsymmetricMatchersContaining {
		toHaveRunTool(tool: string, args?: Record<string, unknown>): void;
		toHaveRequestedTool(tool: string): void;
		toAwaitApproval(tool?: string): void;
	}
}
