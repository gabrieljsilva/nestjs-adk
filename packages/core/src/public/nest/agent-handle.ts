import { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { AgentName } from "../../domain/agent/agent-name";
import type { MediaPart } from "../../domain/model/media-part";
import type { ModelChunk } from "../../domain/model/model-chunk";
import type { AgentResult } from "../../domain/session/agent-result";
import { ApproveInput } from "../../domain/session/approve-input";
import { AskInput } from "../../domain/session/ask-input";
import { DelegateInput } from "../../domain/session/delegate-input";
import { RejectInput } from "../../domain/session/reject-input";
import type { SessionInspection } from "../../domain/session/session-inspection";
import type { RuntimeServices } from "../../runtime/composition/runtime-services";
import { AgentRunCommand } from "../../runtime/run/agent-run-command";

/**
 * Everything a question can carry besides the words.
 *
 * It is a literal because it is the outermost boundary: the application writes it inline
 * and this file turns it into the validated command the runtime runs. A session id may be
 * the string an HTTP request carried, so it does not have to be parsed twice.
 */
export interface AskOptions {
	/** The conversation to continue; absent starts a new one. */
	sessionId?: SessionId | string;
	/** What the model should look at, in the order it should see it. */
	media?: readonly MediaPart[];
}

/**
 * One agent, as an application holds it.
 *
 * It is a handle and not the agent: what answers is the runtime, and this only knows which
 * name to ask for. That is why an application can inject it anywhere without any of its
 * services becoming a dependency of the runtime.
 *
 * Every verb here is the runtime's own verb with the agent already filled in, so nothing
 * about how a run works is decided twice.
 */
export class AgentHandle {
	public constructor(
		public readonly name: AgentName,
		private readonly runtime: RuntimeServices,
	) {}

	/**
	 * Asks the agent something, optionally continuing a session or attaching media.
	 *
	 * The second argument takes a session id directly for the common case, and the options
	 * object for everything else. An attachment needs a model that declares media input:
	 * one that cannot see fails here rather than answering about an image it never received.
	 */
	public async ask(message: string, options?: AskOptions | SessionId): Promise<AgentResult> {
		return this.runtime.runner.ask(this.commandOf(message, options));
	}

	/** The same question, watched: the chunks first, the result as the return value. */
	public stream(message: string, options?: AskOptions | SessionId): AsyncGenerator<ModelChunk, AgentResult> {
		return this.runtime.runner.stream(this.commandOf(message, options));
	}

	/** Where a conversation stands, for a caller that is not running anything. */
	public async inspect(sessionId: SessionId | string): Promise<SessionInspection> {
		return this.runtime.sessions.handle(AgentHandle.sessionOf(sessionId));
	}

	public async approve(sessionId: SessionId | string, callId: ToolCallId, approvedBy?: string): Promise<AgentResult> {
		return this.runtime.runner.approve(ApproveInput.of(AgentHandle.sessionOf(sessionId), callId, approvedBy));
	}

	public async reject(
		sessionId: SessionId | string,
		callId: ToolCallId,
		reason: string,
		deniedBy?: string,
	): Promise<AgentResult> {
		return this.runtime.runner.reject(RejectInput.of(AgentHandle.sessionOf(sessionId), callId, reason, deniedBy));
	}

	/** Hands one task to a specialist this agent declared, keeping the conversation here. */
	public async delegate(sessionId: SessionId | string, to: AgentName, task: string): Promise<AgentResult> {
		return this.runtime.runner.delegate(new DelegateInput(AgentHandle.sessionOf(sessionId), this.name, to, task));
	}

	/** What each model call was actually given, for the same command `ask` would have run. */
	public async explain(message: string, options?: AskOptions | SessionId) {
		return this.runtime.runner.explain(this.commandOf(message, options));
	}

	private commandOf(message: string, options?: AskOptions | SessionId): AgentRunCommand {
		const asked = AgentHandle.optionsOf(options);
		const sessionId = asked.sessionId === undefined ? undefined : AgentHandle.sessionOf(asked.sessionId);
		return new AgentRunCommand(this.name, AskInput.with(message, asked.media ?? [], sessionId));
	}

	private static optionsOf(options?: AskOptions | SessionId): AskOptions {
		if (options === undefined) return {};
		return options instanceof SessionId ? { sessionId: options } : options;
	}

	private static sessionOf(sessionId: SessionId | string): SessionId {
		return sessionId instanceof SessionId ? sessionId : SessionId.from(sessionId);
	}
}
