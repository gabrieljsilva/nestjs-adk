import type { ToolCallObserver } from "../../contracts/tool/tool-call-observer.contract";
import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { AskInput } from "../../domain/session/input/ask-input.command";
import type { SessionMetadata } from "../../domain/session/metadata/session-metadata.value-object";
import { RunLimits } from "../../domain/session/run/run-limits.value-object";
import type { Actor } from "../../domain/tool/access/actor.value-object";

export interface AgentRunParams {
	agent: AgentName;
	input: AskInput;
	limits?: RunLimits;
	model?: LlmModel;
	transferTo?: AgentName;
	sources?: readonly ToolSource[];
	signal?: AbortSignal;
	actor?: Actor;
	toolCalls?: ToolCallObserver;
}

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

	public get metadata(): SessionMetadata {
		return this.input.metadata;
	}
}
