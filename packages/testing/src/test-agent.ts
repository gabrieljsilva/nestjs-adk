import {
	AdkEngine,
	type AgentEvent,
	AgentRegistry,
	type ResolvedAgent,
	type RunInput,
	type RunResult,
	type ScriptTurn,
	ScriptedEngine,
	ScriptedModel,
	type TokenUsage,
	callTool,
	fail,
	text,
} from "@nestjs-adk/core";
import type { Type } from "@nestjs/common";

/** Minimal production handle shape (AdkAgent and AdkWorkflow both satisfy it). */
interface AgentHandle {
	ask(input: RunInput): Promise<RunResult>;
	/** The streaming namespace: `instance.stream.ask(...)`. */
	stream: { ask(input: RunInput): AsyncGenerator<AgentEvent> };
}

/** Anything with a DI `get`: TestingModule, INestApplication, ModuleRef. */
interface DiContainer {
	get<T>(token: (abstract new (...args: never[]) => T) | string | symbol): T;
}

/**
 * Test handle over the REAL agent instance (same DI, same run path as production).
 * Constructing it SCRIPTS the agent: a fresh ScriptedModel is registered as its model
 * override (AgentRegistry test hook). Want real AI? Don't wrap: use the agent directly.
 * `mock*` calls only STACK turns: nothing executes until the next run (triggered via
 * this handle OR any production service), which consumes them as that ONE run's script.
 * Stack again for the next run. Mock methods exist only here, never on the production type.
 */
export class TestAgent<TAgent extends AgentHandle> {
	/** The real agent instance: approve/reject and anything else live here. */
	public readonly instance: TAgent;
	/** This agent's ScriptedModel, registered as the agent's model override. */
	public readonly model: ScriptedModel;

	private readonly engine: AdkEngine;
	/** Script of the NEXT run (real engine): the array lives inside the model until a run consumes it. */
	private draft: ScriptTurn[] = [];

	public constructor(container: DiContainer, agentType: Type<TAgent>) {
		this.instance = container.get(agentType);
		this.engine = container.get(AdkEngine);
		this.model = new ScriptedModel();
		container.get(AgentRegistry).overrideModel(agentType, this.model);
	}

	/** Stacks a tool-call turn: the run will execute the REAL tool (DI) with these args. */
	public mockCallTool(tool: string, args: unknown = {}): this {
		this.stack(callTool(tool, args));
		return this;
	}

	/** Stacks a model text response turn (usually the last turn of a run). */
	public mockText(value: string, usage?: Partial<TokenUsage>): this {
		this.stack(text(value, usage));
		return this;
	}

	/** Stacks a model failure turn (e.g. simulate a 429 to test the router). */
	public mockFail(message: string): this {
		this.stack(fail(message));
		return this;
	}

	/** Runs the real agent (production path) consuming the stacked turns as this run's script. */
	public ask(input: RunInput): ReturnType<TAgent["ask"]> {
		return this.instance.ask(input) as ReturnType<TAgent["ask"]>;
	}

	/** Same as ask(), but streaming the normalized events. */
	public stream(input: RunInput): AsyncGenerator<AgentEvent> {
		return this.instance.stream.ask(input);
	}

	/** Composed instruction the engine saw on the last run (prompt + skills + catalog); snapshot it. */
	public lastInstruction(): string | undefined {
		return (this.engine as { lastAgent?: ResolvedAgent }).lastAgent?.instruction;
	}

	/**
	 * ScriptedEngine consumes turns directly; a real engine consumes them via this agent's ScriptedModel.
	 * The draft array is enqueued on first stack and MUTATED in place until a run consumes it (shift),
	 * so runs triggered by production services (not TestAgent.ask) also see the full script.
	 */
	private stack(turn: ScriptTurn): void {
		if (this.engine instanceof ScriptedEngine) {
			this.engine.push(turn);
			return;
		}
		if (!this.model.scripts.includes(this.draft)) {
			this.draft = [];
			this.model.enqueue(this.draft);
		}
		this.draft.push(turn);
	}
}
