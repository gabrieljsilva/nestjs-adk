import { SessionId } from "../../../common/identity/session-id";
import type { ToolCallId } from "../../../common/identity/tool-call-id";
import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer";
import type { ToolSource } from "../../../contracts/tool/tool-source";
import type { AgentName } from "../../../domain/agent/agent-name";
import type { ContextBudget } from "../../../domain/context/context-budget";
import type { AttachmentReference } from "../../../domain/model/attachment/attachment-reference";
import type { MediaPart } from "../../../domain/model/messages/media-part";
import type { ModelChunk } from "../../../domain/model/streaming/model-chunk";
import { ApproveInput } from "../../../domain/session/input/approve-input";
import { AskInput } from "../../../domain/session/input/ask-input";
import { CreateSessionInput } from "../../../domain/session/input/create-session-input";
import { DelegateInput } from "../../../domain/session/input/delegate-input";
import { RejectInput } from "../../../domain/session/input/reject-input";
import type { MetadataValue } from "../../../domain/session/metadata/metadata-value";
import { SessionMetadata } from "../../../domain/session/metadata/session-metadata";
import type { AgentResult } from "../../../domain/session/run/agent-result";
import type { Session } from "../../../domain/session/session";
import type { SessionInspection } from "../../../domain/session/session-inspection";
import type { Actor } from "../../../domain/tool/access/actor";
import type { RuntimeServices } from "../../../runtime/composition/runtime-services";
import { AgentRunCommand } from "../../../runtime/run/agent-run-command";

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
	 * Names of files the application owns, instead of their bytes.
	 *
	 * Each one is recorded in the journal as it is and handed to the `AttachmentResolver`
	 * on every projection, including this first one, so what the model sees is decided
	 * each time: fresh bytes, a fresh signed address, a line of text, or nothing. Without
	 * a resolver declared, an external reference projects as a note saying so.
	 */
	attachments?: readonly AttachmentReference[];
	/**
	 * Tool sources for this run alone, opened on top of the module's and closed with it.
	 *
	 * This is where a source that belongs to whoever is asking goes: one user's connection,
	 * one run. Nothing about it outlives the run, including when the run fails or is aborted.
	 */
	sources?: readonly ToolSource[];
	/**
	 * What the application knows about this conversation, written as durable facts on it.
	 *
	 * Each key is journaled on the same commit as the question, so it survives a restart,
	 * means the same in any process, and is lost with the turn when the run fails. Last write
	 * per key wins, so a question that repeats a key it was opened with changes nothing, and
	 * one that carries a new value replaces it.
	 *
	 * It is where the key an application looks its own data up by goes. An agent that builds
	 * its prompt per run reads it back as `context.metadata`, which is how the instruction
	 * reaches the data about whoever is asking without any of it travelling through the
	 * message. The lib itself never interprets a key.
	 *
	 * Values are JSON: a string, a number, a boolean, `null`, an array or a plain object.
	 * Anything else, and anything over sixteen kibibytes serialized, is refused here.
	 */
	metadata?: Readonly<Record<string, MetadataValue>>;
	/**
	 * The stop button of whoever is asking.
	 *
	 * Aborting it ends this run and everything it delegated, and the journal records a
	 * cancellation rather than a failure. It is the only way to stop the work: walking away
	 * from `stream` stops the reading, while the provider goes on generating an answer
	 * nobody will read and billing for it. A signal that already aborted ends the run before
	 * it calls anything, which is what makes the button work before the first chunk.
	 */
	signal?: AbortSignal;
	/** Who is asking or deciding. Reaches every tool of the run as `context.actor`, and is what an access policy judges. */
	actor?: Actor;
	/**
	 * Who is told about the tool calls of this run, as they happen.
	 *
	 * `requested` arrives once the gate has screened the turn and before anything runs, with
	 * the tool's definition and whether the call is held for a decision; `settled` follows
	 * each result. It is how an interface draws a card per call without reading the journal
	 * back or re-asking the approval policy. It lives as long as this call does and nothing
	 * about it is stored, so a decision made later, on any instance, brings its own.
	 */
	toolCalls?: ToolCallObserver;
}

/** Everything opening a conversation can be told before anything is asked in it. */
export interface CreateSessionOptions {
	/**
	 * The identifier the application already uses for this conversation.
	 *
	 * This is where an application that owns its own identifiers says so: the chat it just
	 * created is the conversation, under the same id, and nothing has to be reconciled
	 * afterwards. Leaving it out has the runtime name the conversation and answer with it.
	 */
	sessionId?: SessionId | string;
	/**
	 * What the application knows about this conversation, written before anything is asked.
	 *
	 * These are the only events a conversation opened ahead of time has, and they are written
	 * under the run that opened it. A later question that names the same key replaces the
	 * value, because last write per key is what a journal folds to.
	 */
	metadata?: Readonly<Record<string, MetadataValue>>;
}

/** Who decided, and what has to be open for the turn that follows to run. */
export interface DecisionOptions {
	/** Who agreed or refused, recorded in the journal next to the decision. */
	by?: string;
	/** Sources for this run alone, since the suspended run's were closed when it suspended. */
	sources?: readonly ToolSource[];
	/** The stop button of the turn this decision releases, which is a run of its own. */
	signal?: AbortSignal;
	/** Who is asking or deciding. Reaches every tool of the run as `context.actor`, and is what an access policy judges. */
	actor?: Actor;
	/** Told about the released turn as it settles, and about every turn that follows it. */
	toolCalls?: ToolCallObserver;
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
	 * The second argument takes a session id directly for the common case, as text or
	 * parsed, and the options object for everything else. An attachment needs a model that
	 * declares media input: one that cannot see fails here rather than answering about an
	 * image it never received.
	 *
	 * The lib never checks who may use a session id: authorize the caller against it first.
	 */
	public async ask(message: string, options?: AskOptions | SessionId | string): Promise<AgentResult> {
		return this.runtime.runner.ask(this.commandOf(message, options));
	}

	/**
	 * The same question, watched: the chunks first, the result as the return value.
	 *
	 * The lib never checks who may use a session id: authorize the caller against it first.
	 */
	public stream(message: string, options?: AskOptions | SessionId | string): AsyncGenerator<ModelChunk, AgentResult> {
		return this.runtime.runner.stream(this.commandOf(message, options));
	}

	/**
	 * Opens a conversation before anything is asked in it.
	 *
	 * It exists so an application can be the one naming its conversations: pass the id of the
	 * chat you just created and that chat is the conversation. Asking is unchanged by it,
	 * including that a question naming a conversation nobody opened is still refused, so a
	 * stale or mistyped id fails loudly rather than becoming a second conversation.
	 *
	 * An id that already names a conversation is refused with `SessionAlreadyExistsError`,
	 * and nothing about the existing one is touched. Two requests opening the same chat is
	 * the ordinary case: one wins and the other reads that as already done.
	 *
	 * Only the head is written here. The journal begins with the first question, which is
	 * also when observers hear anything about this conversation.
	 */
	public async createSession(options: CreateSessionOptions = {}): Promise<Session> {
		return this.runtime.sessions.create(this.name, CreateSessionInput.fromOptions(options.sessionId, options.metadata));
	}

	/**
	 * The conversation an id names, or nothing when it names none. Reads the head alone.
	 *
	 * The lib never checks who may use a session id: authorize the caller against it first.
	 */
	public async findSessionById(sessionId: SessionId | string): Promise<Session | undefined> {
		return this.runtime.sessions.find(AgentHandle.sessionOf(sessionId));
	}

	/** The same lookup for a caller with nothing to do about absence, which fails instead. */
	public async findSessionByIdOrFail(sessionId: SessionId | string): Promise<Session> {
		return this.runtime.sessions.findOrFail(AgentHandle.sessionOf(sessionId));
	}

	/**
	 * Where a conversation stands, for a caller that is not running anything.
	 *
	 * The lib never checks who may use a session id: authorize the caller against it first.
	 */
	public async inspect(sessionId: SessionId | string): Promise<SessionInspection> {
		return this.runtime.sessions.inspect(AgentHandle.sessionOf(sessionId));
	}

	/**
	 * How full this agent's context window is for a conversation, without running a turn.
	 *
	 * It describes the last call a provider counted, which is the only call anyone measured,
	 * so a conversation nobody has asked anything in answers a window and no size. The same
	 * happens right after a model change, until the new model answers once: a count taken by
	 * another provider divided by this one's window is a wrong number that looks right.
	 *
	 * This is the meter, and it is not what decides compaction. That decision is taken during
	 * a run, on the prompt about to be sent, by the policy the agent runs under.
	 */
	public async contextBudget(sessionId: SessionId | string): Promise<ContextBudget> {
		return this.runtime.sessions.budget(this.name, AgentHandle.sessionOf(sessionId));
	}

	/**
	 * Lets a held call run.
	 *
	 * The sources are declared again because this is a new run: whatever the suspended run had
	 * open was closed when it suspended, and a tool that came from a source needs it open now.
	 *
	 * The lib never checks who may use a session id: authorize the caller against it first.
	 */
	public async approve(
		sessionId: SessionId | string,
		callId: ToolCallId,
		options: DecisionOptions | string = {},
	): Promise<AgentResult> {
		const decided = AgentHandle.decisionOf(options);
		return this.runtime.runner.approve(
			ApproveInput.of(
				AgentHandle.sessionOf(sessionId),
				callId,
				decided.by,
				decided.sources,
				decided.signal,
				decided.actor,
				decided.toolCalls,
			),
		);
	}

	/**
	 * Refuses a held call, with the reason the model is given as the result.
	 *
	 * The lib never checks who may use a session id: authorize the caller against it first.
	 */
	public async reject(
		sessionId: SessionId | string,
		callId: ToolCallId,
		reason: string,
		options: DecisionOptions | string = {},
	): Promise<AgentResult> {
		const decided = AgentHandle.decisionOf(options);
		return this.runtime.runner.reject(
			RejectInput.of(
				AgentHandle.sessionOf(sessionId),
				callId,
				reason,
				decided.by,
				decided.sources,
				decided.signal,
				decided.actor,
				decided.toolCalls,
			),
		);
	}

	/**
	 * Hands one task to a specialist this agent declared, keeping the conversation here.
	 *
	 * The lib never checks who may use a session id: authorize the caller against it first.
	 */
	public async delegate(sessionId: SessionId | string, to: AgentName, task: string): Promise<AgentResult> {
		return this.runtime.runner.delegate(new DelegateInput(AgentHandle.sessionOf(sessionId), this.name, to, task));
	}

	/**
	 * What each model call was actually given, for the same command `ask` would have run.
	 *
	 * The lib never checks who may use a session id: authorize the caller against it first.
	 */
	public async explain(message: string, options?: AskOptions | SessionId | string) {
		return this.runtime.runner.explain(this.commandOf(message, options));
	}

	private commandOf(message: string, options?: AskOptions | SessionId | string): AgentRunCommand {
		const asked = AgentHandle.optionsOf(options);
		const sessionId = asked.sessionId === undefined ? undefined : AgentHandle.sessionOf(asked.sessionId);
		return new AgentRunCommand(
			this.name,
			AskInput.with(
				message,
				asked.media ?? [],
				sessionId,
				undefined,
				asked.attachments ?? [],
				SessionMetadata.fromRecord(asked.metadata ?? {}),
			),
			undefined,
			undefined,
			undefined,
			asked.sources ?? [],
			asked.signal,
			asked.actor,
			asked.toolCalls,
		);
	}

	/**
	 * A session id alone is the common case, and it is accepted as text as well as parsed.
	 *
	 * The text form is the one an application actually holds: the id of a chat read from a
	 * database is a string, and every other verb here already takes it that way. Accepting
	 * only the parsed form left `ask(message, chat.id)` falling through to the options
	 * branch, where a string has no `sessionId`, and the question quietly opened a second
	 * conversation instead of continuing the one it named.
	 */
	private static optionsOf(options?: AskOptions | SessionId | string): AskOptions {
		if (options === undefined) return {};
		if (typeof options === "string" || options instanceof SessionId) return { sessionId: options };
		return options;
	}

	/** The name alone is the common case, so it is still accepted where the options object goes. */
	private static decisionOf(options: DecisionOptions | string): DecisionOptions {
		return typeof options === "string" ? { by: options } : options;
	}

	private static sessionOf(sessionId: SessionId | string): SessionId {
		return sessionId instanceof SessionId ? sessionId : SessionId.from(sessionId);
	}
}
