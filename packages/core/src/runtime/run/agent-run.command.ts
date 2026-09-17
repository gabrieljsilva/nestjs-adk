import type { ToolCallObserver } from "../../contracts/tool/tool-call-observer.contract";
import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { AskInput } from "../../domain/session/input/ask-input.command";
import type { SessionMetadata } from "../../domain/session/metadata/session-metadata.value-object";
import { RunLimits } from "../../domain/session/run/run-limits.value-object";
import type { Actor } from "../../domain/tool/access/actor.value-object";

/** One command to run, named rather than ordered. */
export interface AgentRunParams {
	agent: AgentName;
	input: AskInput;
	/**
	 * Already resolved from the module, the agent and the call, in that order. Resolving them
	 * before the run keeps the decision in one place and out of the loop that has to obey it.
	 */
	limits?: RunLimits;
	/**
	 * An override for this call alone, for routing a single request without redeclaring the
	 * agent. It is a production feature and not a test hook: a test replaces the
	 * `ModelResolver` instead, which is a port the container can swap.
	 */
	model?: LlmModel;
	/**
	 * Hands the session to another agent before this message is answered.
	 *
	 * It is the handover a developer decides, next to the one a model decides by calling
	 * the transfer tool. Both go through the same declared edges: code that could move a
	 * session anywhere would make the edges a suggestion.
	 */
	transferTo?: AgentName;
	/**
	 * Tool sources opened for this run alone, on top of the module's.
	 *
	 * A source is a connection with a credential behind it, and the credential often belongs
	 * to whoever is asking rather than to the application. Declaring it here keeps one user's
	 * connection inside one run: it opens when the run starts and closes when it ends,
	 * however it ends.
	 */
	sources?: readonly ToolSource[];
	/**
	 * The caller's stop button, for a run nobody is waiting for anymore.
	 *
	 * Aborting it cancels this run and everything it delegated, and the journal records
	 * a cancellation rather than a failure. It is the only way to stop the work: a caller
	 * that walks away from the stream stops reading, while the provider goes on generating
	 * an answer nobody will see and billing for it.
	 */
	signal?: AbortSignal;
	actor?: Actor;
	/** Told about each tool call of this run as the model asks for it and as it settles. */
	toolCalls?: ToolCallObserver;
}

/** One command to run, resolved: which agent, what was said and under which limits. */
export class AgentRunCommand {
	public readonly agent: AgentName;
	public readonly input: AskInput;
	public readonly limits: RunLimits;
	public readonly model?: LlmModel;
	public readonly transferTo?: AgentName;
	public readonly sources: readonly ToolSource[];
	public readonly signal?: AbortSignal;
	public readonly actor?: Actor;
	public readonly toolCalls?: ToolCallObserver;

	public constructor(params: AgentRunParams) {
		this.agent = params.agent;
		this.input = params.input;
		this.limits = params.limits ?? RunLimits.unbounded();
		this.model = params.model;
		this.transferTo = params.transferTo;
		this.sources = params.sources ?? [];
		this.signal = params.signal;
		this.actor = params.actor;
		this.toolCalls = params.toolCalls;
	}

	public get continuesSession(): boolean {
		return this.input.continuesSession;
	}

	/** What this command says about the session, which is part of what it asked rather than of who asked. */
	public get metadata(): SessionMetadata {
		return this.input.metadata;
	}
}
