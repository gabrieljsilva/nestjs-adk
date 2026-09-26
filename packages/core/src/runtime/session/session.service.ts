import type { SessionId } from "../../common/identity/session-id.value-object";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ContextBudget } from "../../domain/context/context-budget.value-object";
import type { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import type { CreateSessionInput } from "../../domain/session/input/create-session-input.command";
import type { SessionInspection } from "../../domain/session/session-inspection.value-object";
import type { Session } from "../../domain/session/session.entity";
import type { AttachArtifactUseCase } from "../artifact/attach-artifact.use-case";
import type { ContextService } from "../context/context.service";
import type { InspectContextBudgetUseCase } from "../context/inspect-context-budget.use-case";
import type { CreateSessionUseCase } from "./create-session.use-case";
import type { InspectSessionUseCase } from "./inspect-session.use-case";
import type { SessionRepository } from "./session-repository.service";

export class SessionService {
	public constructor(
		private readonly creating: CreateSessionUseCase,
		private readonly inspecting: InspectSessionUseCase,
		private readonly sessions: SessionRepository,
		private readonly budgeting: InspectContextBudgetUseCase,
		private readonly artifacts: ArtifactStorage,
		private readonly context: ContextService,
		private readonly attaching: AttachArtifactUseCase,
	) {}

	public async attachArtifact(sessionId: SessionId, content: ArtifactContent): Promise<AttachmentReference> {
		return this.attaching.execute(SessionContext.fromSessionId(sessionId), content);
	}

	public async create(agent: AgentName, input: CreateSessionInput): Promise<Session> {
		return this.creating.execute(agent, input);
	}

	public async inspect(sessionId: SessionId): Promise<SessionInspection> {
		return this.inspecting.execute(sessionId);
	}

	public async budget(agent: AgentName, sessionId: SessionId): Promise<ContextBudget> {
		return this.budgeting.execute(agent, sessionId);
	}

	public async find(sessionId: SessionId): Promise<Session | undefined> {
		return this.sessions.find(SessionContext.fromSessionId(sessionId));
	}

	public async findOrFail(sessionId: SessionId): Promise<Session> {
		return this.sessions.findOrFail(SessionContext.fromSessionId(sessionId));
	}

	public async delete(sessionId: SessionId): Promise<void> {
		const context = SessionContext.fromSessionId(sessionId);
		await this.sessions.delete(context);
		await this.artifacts.deleteAll(context);
		this.context.forgetSession(context);
	}
}
