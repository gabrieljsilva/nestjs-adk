import type { SessionId } from "../../common/identity/session-id";
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

	public async ask(message: string, sessionId?: SessionId): Promise<AgentResult> {
		return this.runtime.runner.ask(this.commandOf(message, sessionId));
	}

	/**
	 * The same question with something for the model to look at.
	 *
	 * The words are still required, because an image with nothing asked about it leaves the
	 * model guessing. The agent's model has to declare media input: one that cannot see
	 * fails here rather than answering about an image it never received.
	 */
	public async askWith(message: string, attachments: readonly MediaPart[], sessionId?: SessionId): Promise<AgentResult> {
		return this.runtime.runner.ask(this.commandOf(message, sessionId, attachments));
	}

	/** The same question, watched: the chunks first, the result as the return value. */
	public stream(message: string, sessionId?: SessionId): AsyncGenerator<ModelChunk, AgentResult> {
		return this.runtime.runner.stream(this.commandOf(message, sessionId));
	}

	/** Watching a question that has something attached to it. */
	public streamWith(
		message: string,
		attachments: readonly MediaPart[],
		sessionId?: SessionId,
	): AsyncGenerator<ModelChunk, AgentResult> {
		return this.runtime.runner.stream(this.commandOf(message, sessionId, attachments));
	}

	/** Where a conversation stands, for a caller that is not running anything. */
	public async inspect(sessionId: SessionId): Promise<SessionInspection> {
		return this.runtime.sessions.handle(sessionId);
	}

	public async approve(sessionId: SessionId, callId: ToolCallId, approvedBy?: string): Promise<AgentResult> {
		return this.runtime.runner.approve(ApproveInput.of(sessionId, callId, approvedBy));
	}

	public async reject(
		sessionId: SessionId,
		callId: ToolCallId,
		reason: string,
		deniedBy?: string,
	): Promise<AgentResult> {
		return this.runtime.runner.reject(RejectInput.of(sessionId, callId, reason, deniedBy));
	}

	/** Hands one task to a specialist this agent declared, keeping the conversation here. */
	public async delegate(sessionId: SessionId, to: AgentName, task: string): Promise<AgentResult> {
		return this.runtime.runner.delegate(new DelegateInput(sessionId, this.name, to, task));
	}

	/** What each model call was actually given, for the same command `ask` would have run. */
	public async explain(message: string, sessionId?: SessionId) {
		return this.runtime.runner.explain(this.commandOf(message, sessionId));
	}

	private commandOf(message: string, sessionId?: SessionId, attachments: readonly MediaPart[] = []): AgentRunCommand {
		return new AgentRunCommand(this.name, AskInput.with(message, attachments, sessionId));
	}
}
