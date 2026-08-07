import type { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { AgentName } from "../../domain/agent/agent-name";
import type { ModelChunk } from "../../domain/model/model-chunk";
import type { PromptContext } from "../../domain/prompt/prompt-context";
import type { AgentResult } from "../../domain/session/agent-result";
import type { SessionInspection } from "../../domain/session/session-inspection";
import type { AgentHandle, AskOptions, DecisionOptions } from "./agent-handle";
import type { AgentPrompting } from "./agent-prompting";
import { AgentNotBoundError } from "./errors/agent-not-bound.error";

/**
 * An agent an application can inject as itself.
 *
 * `@Agent` already makes the class a provider, so a service can ask NestJS for it by type.
 * What extending this adds is the verbs: the class answers `ask` the way a handle does,
 * and the service that injected it never learns that a registry exists.
 *
 * ```ts
 * @Agent({ name: "support", description: "...", prompt: "..." })
 * export class SupportAgent extends AdkAgent {}
 *
 * export class ChatService {
 *   public constructor(private readonly support: SupportAgent) {}
 *   public reply(message: string) { return this.support.ask(message); }
 * }
 * ```
 *
 * The handle arrives when the module composes the runtime, which is after NestJS has built
 * everything: an agent used before that fails saying so rather than answering half wired.
 * Extending is optional, and `AgentRegistry` stays the way to reach an agent from a class
 * that already extends something else.
 */
export abstract class AdkAgent {
	private bound?: AgentHandle;
	private prompts?: AgentPrompting;

	/** Called once by the module, with the handle for the agent this class declared. */
	public bindTo(handle: AgentHandle, prompting?: AgentPrompting): void {
		this.bound = handle;
		this.prompts = prompting;
	}

	public get agentName(): AgentName {
		return this.handle.name;
	}

	public async ask(message: string, options?: AskOptions | SessionId): Promise<AgentResult> {
		return this.handle.ask(message, options);
	}

	public stream(message: string, options?: AskOptions | SessionId): AsyncGenerator<ModelChunk, AgentResult> {
		return this.handle.stream(message, options);
	}

	public async inspect(sessionId: SessionId | string): Promise<SessionInspection> {
		return this.handle.inspect(sessionId);
	}

	public async approve(
		sessionId: SessionId | string,
		callId: ToolCallId,
		options: DecisionOptions | string = {},
	): Promise<AgentResult> {
		return this.handle.approve(sessionId, callId, options);
	}

	public async reject(
		sessionId: SessionId | string,
		callId: ToolCallId,
		reason: string,
		options: DecisionOptions | string = {},
	): Promise<AgentResult> {
		return this.handle.reject(sessionId, callId, reason, options);
	}

	/** Hands one task to a specialist this agent declared, keeping the conversation here. */
	public async delegate(sessionId: SessionId | string, to: AgentName, task: string): Promise<AgentResult> {
		return this.handle.delegate(sessionId, to, task);
	}

	/** What each model call was actually given, for the same command `ask` would have run. */
	public async explain(message: string, options?: AskOptions | SessionId) {
		return this.handle.explain(message, options);
	}

	/**
	 * The prompt for one run, built with everything this class has injected.
	 *
	 * Override it when the instruction depends on data: who the customer is, which plan they
	 * are on, what language to answer in. The agent is an ordinary NestJS provider, so the
	 * repository that knows those things is a constructor argument like anywhere else, and the
	 * data reaches the system prompt instead of being concatenated into the user's message.
	 * That difference is the point: text in the system prompt is instruction, and text in the
	 * message is something a model has already been told to treat as somebody else's words.
	 *
	 * ```ts
	 * protected async prompt(context: PromptContext): Promise<string> {
	 *   const customer = await this.customers.findByOwner(context.owner);
	 *   return this.prompting.renderFromFileOrFail("support.md", { name: customer.name });
	 * }
	 * ```
	 *
	 * A prompt built per run is a prompt the provider cannot cache. The system prompt is the
	 * head of the prefix, so anything that changes there invalidates everything after it.
	 * Measured on this repository's own paid suite: 3031 of 3751 prompt tokens came back
	 * cached, worth 68% of that run's input bill. Keep the variable part small and stable
	 * within a session: a customer name is fine, a timestamp is not. This is also why it is
	 * resolved once per agent per run and never per turn.
	 *
	 * Declaring `@Agent({ prompt })` and overriding this at the same time fails at boot. Two
	 * prompts is an ambiguity, and a precedence rule would be a silently ignored declaration.
	 */
	protected async prompt(_context: PromptContext): Promise<string | undefined> {
		return undefined;
	}

	/**
	 * Rendering and reading prompts, for use inside `prompt()`.
	 *
	 * It is deliberately not the same name as the method: `this.prompt` is what this agent
	 * answers with, and `this.prompting` is what it builds that answer with.
	 */
	protected get prompting(): AgentPrompting {
		const prompting = this.prompts;
		if (prompting === undefined) throw new AgentNotBoundError(this.constructor.name);
		return prompting;
	}

	private get handle(): AgentHandle {
		const bound = this.bound;
		if (bound === undefined) throw new AgentNotBoundError(this.constructor.name);
		return bound;
	}
}
