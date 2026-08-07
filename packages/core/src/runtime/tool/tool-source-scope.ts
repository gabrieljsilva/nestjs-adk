import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import type { ToolSource } from "../../contracts/tool-source";
import { ToolSourceAuthError } from "../../domain/tool/errors/tool-source-auth.error";
import { ToolSourceUnavailableError } from "../../domain/tool/errors/tool-source-unavailable.error";
import type { ToolDefinition } from "../../domain/tool/tool-definition";

/**
 * Opens every tool source once for one run, and closes what it opened.
 *
 * Closing is the whole reason this exists. A run can end by answering, by failing or by
 * being aborted mid stream, and a connection that only closes on the first of those
 * leaks on the other two. Only sources that actually opened are closed, so a source that
 * refused is not handed a close it never earned.
 *
 * A source that will not authorize does not stop the run. It is reported and left out,
 * and the model works with the tools that did open, which is a smaller conversation
 * rather than no conversation.
 *
 * The module's sources and the run's are summed, module first, and that order is what a
 * caller sees: two sources offering the same tool name leave the module's declaration
 * first in the list, so a run cannot quietly shadow a tool the application declared.
 */
export class ToolSourceScope {
	private readonly opened: ToolSource[] = [];
	private readonly refused: ToolSourceAuthError[] = [];
	private readonly unreachable: ToolSourceUnavailableError[] = [];
	private readonly sources: readonly ToolSource[];

	public constructor(declared: readonly ToolSource[] = [], perRun: readonly ToolSource[] = []) {
		this.sources = [...declared, ...perRun];
	}

	/** Everything the sources offered, in the order the sources were declared. */
	public async open(sessionId: SessionId, runId: AgentRunId, signal?: AbortSignal): Promise<readonly ToolDefinition[]> {
		const tools: ToolDefinition[] = [];
		for (const source of this.sources) {
			try {
				const offered = await source.open(sessionId, runId, signal);
				this.opened.push(source);
				tools.push(...offered);
			} catch (error) {
				if (error instanceof ToolSourceAuthError) {
					this.refused.push(error);
					continue;
				}
				if (error instanceof ToolSourceUnavailableError) {
					this.unreachable.push(error);
					continue;
				}
				throw error;
			}
		}
		return tools;
	}

	/** What could not be authorized, for the run to record before it carries on. */
	/** Sources nobody could reach this run, which is worth knowing and is not a failure. */
	public get unavailable(): readonly ToolSourceUnavailableError[] {
		return [...this.unreachable];
	}

	public get unauthorized(): readonly ToolSourceAuthError[] {
		return [...this.refused];
	}

	/** Closes everything that opened; one source that will not close never hides another. */
	public async close(runId: AgentRunId): Promise<void> {
		const closing = this.opened.splice(0);
		await Promise.all(closing.map((source) => source.close(runId).catch(() => undefined)));
	}
}
