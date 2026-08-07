import { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { ToolSource } from "../../contracts/tool-source";
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
	/**
	 * Tool sources for this run alone, opened on top of the module's and closed with it.
	 *
	 * This is where a source that belongs to whoever is asking goes: one user's connection,
	 * one run. Nothing about it outlives the run, including when the run fails or is aborted.
	 */
	sources?: readonly ToolSource[];
}

/** Who decided, and what has to be open for the turn that follows to run. */
export interface DecisionOptions {
	/** Who agreed or refused, recorded in the journal next to the decision. */
	by?: string;
	/** Sources for this run alone, since the suspended run's were closed when it suspended. */
	sources?: readonly ToolSource[];
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

	/**
	 * Lets a held call run.
	 *
	 * The sources are declared again because this is a new run: whatever the suspended run had
	 * open was closed when it suspended, and a tool that came from a source needs it open now.
	 */
	public async approve(
		sessionId: SessionId | string,
		callId: ToolCallId,
		options: DecisionOptions | string = {},
	): Promise<AgentResult> {
		const decided = AgentHandle.decisionOf(options);
		return this.runtime.runner.approve(
			ApproveInput.of(AgentHandle.sessionOf(sessionId), callId, decided.by, decided.sources),
		);
	}

	public async reject(
		sessionId: SessionId | string,
		callId: ToolCallId,
		reason: string,
		options: DecisionOptions | string = {},
	): Promise<AgentResult> {
		const decided = AgentHandle.decisionOf(options);
		return this.runtime.runner.reject(
			RejectInput.of(AgentHandle.sessionOf(sessionId), callId, reason, decided.by, decided.sources),
		);
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
		return new AgentRunCommand(
			this.name,
			AskInput.with(message, asked.media ?? [], sessionId),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			asked.sources ?? [],
		);
	}

	private static optionsOf(options?: AskOptions | SessionId): AskOptions {
		if (options === undefined) return {};
		return options instanceof SessionId ? { sessionId: options } : options;
	}

	/** The name alone is the common case, so it is still accepted where the options object goes. */
	private static decisionOf(options: DecisionOptions | string): DecisionOptions {
		return typeof options === "string" ? { by: options } : options;
	}

	private static sessionOf(sessionId: SessionId | string): SessionId {
		return sessionId instanceof SessionId ? sessionId : SessionId.from(sessionId);
	}
}
