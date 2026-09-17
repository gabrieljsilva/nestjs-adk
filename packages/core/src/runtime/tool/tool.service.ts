import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import type { RunJournal } from "../run/journal/run-journal.service";
import type { RunScope } from "../run/scope/run-scope.value-object";
import type { RunProgress } from "../run/settle/run-progress.value-object";
import type { SessionRepository } from "../session/session-repository.service";
import { ToolSourceScope } from "./tool-source-scope.service";

export class ToolService {
	public constructor(
		private readonly sessions: SessionRepository,
		private readonly journal: RunJournal,
		private readonly declared: readonly ToolSource[] = [],
	) {}

	public async withSources<T>(
		perRun: readonly ToolSource[],
		runId: AgentRunId,
		body: (sources: ToolSourceScope) => Promise<T>,
	): Promise<T> {
		const sources = new ToolSourceScope(this.declared, perRun);
		try {
			return await body(sources);
		} finally {
			await sources.close(runId);
		}
	}

	public async recordUnauthorized(scope: RunScope, progress: RunProgress, sources: ToolSourceScope): Promise<void> {
		if (sources.unauthorized.length === 0) return;
		progress.advanced(
			await this.sessions.commit(
				scope.context,
				progress.state.revision,
				this.journal.reauth(scope.started, sources.unauthorized),
				progress.state,
			),
		);
	}
}
