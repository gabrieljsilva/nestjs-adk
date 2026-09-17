import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import type { RunJournal } from "../run/journal/run-journal.service";
import type { RunScope } from "../run/scope/run-scope.value-object";
import type { RunProgress } from "../run/settle/run-progress.value-object";
import type { SessionRepository } from "../session/session-repository.service";
import { ToolSourceScope } from "./tool-source-scope.service";

/**
 * The one door onto the tool module for a run: the sources it may use, for as long as it
 * lasts, and the record of the ones that would not let it in.
 *
 * Opening and closing live here rather than in the use case that needs them because
 * closing is the part that has to happen however the run ends. A use case that wrote the
 * `try/finally` itself would be one `return` away from leaking a connection, and the next
 * use case would have to write it again.
 */
export class ToolService {
	public constructor(
		private readonly sessions: SessionRepository,
		private readonly journal: RunJournal,
		/** Declared by the module, offered to every run before the run's own sources. */
		private readonly declared: readonly ToolSource[] = [],
	) {}

	/** Runs the body with the module's sources and this run's, and closes what opened. */
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

	/**
	 * Records a source that would not let the runtime in, and lets the run carry on.
	 * A conversation with fewer tools is worth more than no conversation, and somebody
	 * still gets told that a credential has to be renewed.
	 */
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
