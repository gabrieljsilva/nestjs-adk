import type { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { AgentName } from "../../domain/agent/agent-name";
import type { ModelChunk } from "../../domain/model/model-chunk";
import type { AgentResult } from "../../domain/session/agent-result";
import type { SessionInspection } from "../../domain/session/session-inspection";
import type { AgentHandle, AskOptions } from "./agent-handle";
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

	/** Called once by the module, with the handle for the agent this class declared. */
	public bindTo(handle: AgentHandle): void {
		this.bound = handle;
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

	public async approve(sessionId: SessionId | string, callId: ToolCallId, approvedBy?: string): Promise<AgentResult> {
		return this.handle.approve(sessionId, callId, approvedBy);
	}

	public async reject(
		sessionId: SessionId | string,
		callId: ToolCallId,
		reason: string,
		deniedBy?: string,
	): Promise<AgentResult> {
		return this.handle.reject(sessionId, callId, reason, deniedBy);
	}

	/** Hands one task to a specialist this agent declared, keeping the conversation here. */
	public async delegate(sessionId: SessionId | string, to: AgentName, task: string): Promise<AgentResult> {
		return this.handle.delegate(sessionId, to, task);
	}

	/** What each model call was actually given, for the same command `ask` would have run. */
	public async explain(message: string, options?: AskOptions | SessionId) {
		return this.handle.explain(message, options);
	}

	private get handle(): AgentHandle {
		const bound = this.bound;
		if (bound === undefined) throw new AgentNotBoundError(this.constructor.name);
		return bound;
	}
}
