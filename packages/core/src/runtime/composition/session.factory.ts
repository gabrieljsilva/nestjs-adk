import type { IdGenerator } from "../../common/identity/id-generator.contract";
import type { Clock } from "../../common/time/clock.contract";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import type { ContextService } from "../context/context.service";
import { InspectContextBudgetUseCase } from "../context/inspect-context-budget.use-case";
import { CreateSessionUseCase } from "../session/create-session.use-case";
import { InspectSessionUseCase } from "../session/inspect-session.use-case";
import { SessionService } from "../session/session.service";
import type { ComposedRun } from "./composed-run.value-object";

export class SessionComposer {
	public compose(
		catalog: AgentCatalog,
		artifacts: ArtifactStorage,
		clock: Clock,
		ids: IdGenerator,
		context: ContextService,
		run: ComposedRun,
	): SessionService {
		const inspecting = new InspectSessionUseCase(run.sessions);
		return new SessionService(
			new CreateSessionUseCase(run.sessions, clock, ids, run.runs, run.journal),
			inspecting,
			run.sessions,
			new InspectContextBudgetUseCase(inspecting, catalog),
			artifacts,
			context,
		);
	}
}
