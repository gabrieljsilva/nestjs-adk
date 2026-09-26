import { SessionId } from "../../common/identity/session-id.value-object";
import type { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import type { ToolCallObserver } from "../../contracts/tool/tool-call-observer.contract";
import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ContextBudget } from "../../domain/context/context-budget.value-object";
import type { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import type { MediaPart } from "../../domain/model/messages/media-part.value-object";
import type { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import { ApproveInput } from "../../domain/session/input/approve-input.command";
import { AskInput } from "../../domain/session/input/ask-input.command";
import { CreateSessionInput } from "../../domain/session/input/create-session-input.command";
import { DelegateInput } from "../../domain/session/input/delegate-input.command";
import { RejectInput } from "../../domain/session/input/reject-input.command";
import type { MetadataValue } from "../../domain/session/metadata/metadata-value.value-object";
import { SessionMetadata } from "../../domain/session/metadata/session-metadata.value-object";
import type { AgentResult } from "../../domain/session/run/agent-result.value-object";
import type { SessionInspection } from "../../domain/session/session-inspection.value-object";
import type { Session } from "../../domain/session/session.entity";
import type { Actor } from "../../domain/tool/access/actor.value-object";
import type { RuntimeServices } from "../../runtime/composition/runtime-services.value-object";
import { AgentRunCommand } from "../../runtime/run/agent-run.command";
import { AgentNotBoundError } from "../errors/agent-not-bound.error";

interface AgentBinding {
	name: AgentName;
	runtime: RuntimeServices;
}

/**
 * Everything a question can carry besides the words: a session to continue, media, files,
 * attachments, tool sources for this run alone, metadata, an abort signal, the actor and a
 * tool call observer.
 *
 * `media` is an image the model looks at. `files` is content the model reads through the
 * artifact tools: a `.md`, a `.csv`, a JSON document, stored under the session and named in
 * the journal. `attachments` is a reference to something already stored or owned elsewhere.
 *
 * `metadata` is journaled with the question and read back as `context.metadata`; values are
 * JSON and anything over sixteen kibibytes serialized is refused. Aborting `signal` is the
 * only way to stop the work: walking away from `stream` leaves the provider generating and
 * billing.
 */
export interface AskOptions {
	sessionId?: SessionId | string;
	media?: readonly MediaPart[];
	files?: readonly ArtifactContent[];
	attachments?: readonly AttachmentReference[];
	sources?: readonly ToolSource[];
	metadata?: Readonly<Record<string, MetadataValue>>;
	signal?: AbortSignal;
	actor?: Actor;
	toolCalls?: ToolCallObserver;
}

/**
 * Everything opening a conversation can be told before anything is asked in it: the id the
 * application already uses for it, and metadata written under the run that opened it.
 */
export interface CreateSessionOptions {
	sessionId?: SessionId | string;
	metadata?: Readonly<Record<string, MetadataValue>>;
}

/**
 * Who approved or refused, and what the turn that follows needs: tool sources, since the
 * suspended run's were closed, a stop button of its own, the actor and a tool call observer.
 */
export interface DecisionOptions {
	by?: string;
	sources?: readonly ToolSource[];
	signal?: AbortSignal;
	actor?: Actor;
	toolCalls?: ToolCallObserver;
}

/**
 * One agent, as an application holds it: `ask` and `stream` for a question, `createSession`,
 * `findSessionById`, `inspect` and `contextBudget` for a conversation, `approve`, `reject`
 * and `delegate` for what a run is waiting on, and `explain` for what a model was given.
 *
 * A session id is accepted as text or parsed, and the lib never checks who may use one:
 * authorize the caller against it first. Using a handle nothing bound raises
 * `AgentNotBoundError`.
 */
export class AgentHandle {
	private binding?: AgentBinding;

	public constructor(name?: AgentName, runtime?: RuntimeServices) {
		if (name !== undefined && runtime !== undefined) this.binding = { name, runtime };
	}

	public get name(): AgentName {
		return this.bound.name;
	}

	protected adopt(handle: AgentHandle): void {
		this.binding = handle.binding;
	}

	private get runtime(): RuntimeServices {
		return this.bound.runtime;
	}

	private get bound(): AgentBinding {
		const binding = this.binding;
		if (binding === undefined) throw new AgentNotBoundError(this.constructor.name);
		return binding;
	}

	public async ask(message: string, options?: AskOptions | SessionId | string): Promise<AgentResult> {
		return this.runtime.runner.ask(this.buildCommand(message, options));
	}

	public stream(message: string, options?: AskOptions | SessionId | string): AsyncGenerator<ModelChunk, AgentResult> {
		return this.runtime.runner.stream(this.buildCommand(message, options));
	}

	public async createSession(options: CreateSessionOptions = {}): Promise<Session> {
		return this.runtime.sessions.create(this.name, CreateSessionInput.fromOptions(options.sessionId, options.metadata));
	}

	public async findSessionById(sessionId: SessionId | string): Promise<Session | undefined> {
		return this.runtime.sessions.find(AgentHandle.resolveSession(sessionId));
	}

	public async findSessionByIdOrFail(sessionId: SessionId | string): Promise<Session> {
		return this.runtime.sessions.findOrFail(AgentHandle.resolveSession(sessionId));
	}

	public async inspect(sessionId: SessionId | string): Promise<SessionInspection> {
		return this.runtime.sessions.inspect(AgentHandle.resolveSession(sessionId));
	}

	public async attachArtifact(sessionId: SessionId | string, content: ArtifactContent): Promise<AttachmentReference> {
		return this.runtime.sessions.attachArtifact(AgentHandle.resolveSession(sessionId), content);
	}

	public async contextBudget(sessionId: SessionId | string): Promise<ContextBudget> {
		return this.runtime.sessions.budget(this.name, AgentHandle.resolveSession(sessionId));
	}

	public async approve(
		sessionId: SessionId | string,
		callId: ToolCallId,
		options: DecisionOptions | string = {},
	): Promise<AgentResult> {
		const decided = AgentHandle.resolveDecision(options);
		return this.runtime.runner.approve(
			new ApproveInput({
				sessionId: AgentHandle.resolveSession(sessionId),
				callId: callId,
				approvedBy: decided.by,
				sources: decided.sources,
				signal: decided.signal,
				actor: decided.actor,
				toolCalls: decided.toolCalls,
			}),
		);
	}

	public async reject(
		sessionId: SessionId | string,
		callId: ToolCallId,
		reason: string,
		options: DecisionOptions | string = {},
	): Promise<AgentResult> {
		const decided = AgentHandle.resolveDecision(options);
		return this.runtime.runner.reject(
			new RejectInput({
				sessionId: AgentHandle.resolveSession(sessionId),
				callId: callId,
				reason: reason,
				deniedBy: decided.by,
				sources: decided.sources,
				signal: decided.signal,
				actor: decided.actor,
				toolCalls: decided.toolCalls,
			}),
		);
	}

	public async delegate(sessionId: SessionId | string, to: AgentName, task: string): Promise<AgentResult> {
		return this.runtime.runner.delegate(new DelegateInput(AgentHandle.resolveSession(sessionId), this.name, to, task));
	}

	public async explain(message: string, options?: AskOptions | SessionId | string) {
		return this.runtime.runner.explain(this.buildCommand(message, options));
	}

	private buildCommand(message: string, options?: AskOptions | SessionId | string): AgentRunCommand {
		const asked = AgentHandle.resolveOptions(options);
		const sessionId = asked.sessionId === undefined ? undefined : AgentHandle.resolveSession(asked.sessionId);
		return new AgentRunCommand({
			agent: this.name,
			input: new AskInput({
				message: message,
				attachments: asked.media ?? [],
				sessionId: sessionId,
				references: asked.attachments ?? [],
				files: asked.files ?? [],
				metadata: SessionMetadata.fromRecord(asked.metadata ?? {}),
			}),
			sources: asked.sources ?? [],
			signal: asked.signal,
			actor: asked.actor,
			toolCalls: asked.toolCalls,
		});
	}

	private static resolveOptions(options?: AskOptions | SessionId | string): AskOptions {
		if (options === undefined) return {};
		if (typeof options === "string" || options instanceof SessionId) return { sessionId: options };
		return options;
	}

	private static resolveDecision(options: DecisionOptions | string): DecisionOptions {
		return typeof options === "string" ? { by: options } : options;
	}

	private static resolveSession(sessionId: SessionId | string): SessionId {
		return sessionId instanceof SessionId ? sessionId : SessionId.from(sessionId);
	}
}
