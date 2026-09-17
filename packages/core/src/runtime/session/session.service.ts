import type { SessionId } from "../../common/identity/session-id.value-object";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { ContextBudget } from "../../domain/context/context-budget.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import type { CreateSessionInput } from "../../domain/session/input/create-session-input.command";
import type { SessionInspection } from "../../domain/session/session-inspection.value-object";
import type { Session } from "../../domain/session/session.entity";
import type { ContextService } from "../context/context.service";
import type { InspectContextBudgetUseCase } from "../context/inspect-context-budget.use-case";
import type { CreateSessionUseCase } from "./create-session.use-case";
import type { InspectSessionUseCase } from "./inspect-session.use-case";
import type { SessionRepository } from "./session-repository.service";

/**
 * What an application calls to work with a conversation rather than to run one.
 *
 * Six verbs: open one, look at where one stands, read how full its context is, and find
 * one by identifier with absence either answered or refused. It is to sessions what
 * `AgentRunner` is to runs, and for the same reason: the name a consumer holds must not
 * also be the class that decides how any of it happens.
 *
 * The two lookups answer the head and nothing else, so telling whether a chat already has
 * a conversation costs one row. `inspect` and `budget` are the ones that project, because
 * where a conversation stands can only be known by reading what happened in it.
 */
export class SessionService {
	public constructor(
		private readonly creating: CreateSessionUseCase,
		private readonly inspecting: InspectSessionUseCase,
		private readonly sessions: SessionRepository,
		private readonly budgeting: InspectContextBudgetUseCase,
		private readonly artifacts: ArtifactStorage,
		private readonly context: ContextService,
	) {}

	/** Opens a conversation the application names, or names one itself when it does not. */
	public async create(agent: AgentName, input: CreateSessionInput): Promise<Session> {
		return this.creating.execute(agent, input);
	}

	/** Where a conversation stands, for a caller that is not running anything. */
	public async inspect(sessionId: SessionId): Promise<SessionInspection> {
		return this.inspecting.execute(sessionId);
	}

	/** How much of the agent's window the conversation's last call took, for a caller drawing a meter. */
	public async budget(agent: AgentName, sessionId: SessionId): Promise<ContextBudget> {
		return this.budgeting.execute(agent, sessionId);
	}

	public async find(sessionId: SessionId): Promise<Session | undefined> {
		return this.sessions.find(SessionContext.fromSessionId(sessionId));
	}

	public async findOrFail(sessionId: SessionId): Promise<Session> {
		return this.sessions.findOrFail(SessionContext.fromSessionId(sessionId));
	}

	/**
	 * Everything the conversation left behind: its journal, its artifacts and what the runtime
	 * was still holding in memory about it.
	 *
	 * The last of the three is why this exists rather than the application calling two ports
	 * itself. `AttachmentReader` caches bytes by session and id, and a cache nobody told about
	 * the delete would answer a later read with an image from a conversation that is gone.
	 */
	public async delete(sessionId: SessionId): Promise<void> {
		const context = SessionContext.fromSessionId(sessionId);
		await this.sessions.delete(context);
		await this.artifacts.deleteAll(context);
		this.context.forgetSession(context);
	}
}
