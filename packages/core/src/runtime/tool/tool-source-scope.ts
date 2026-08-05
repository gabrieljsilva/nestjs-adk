import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import type { ToolSource } from "../../contracts/tool-source";
import { ToolSourceAuthError } from "../../domain/tool/errors/tool-source-auth.error";
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
 */
export class ToolSourceScope {
	private readonly opened: ToolSource[] = [];
	private readonly refused: ToolSourceAuthError[] = [];

	public constructor(private readonly sources: readonly ToolSource[] = []) {}

	/** Everything the sources offered, in the order the sources were declared. */
	public async open(sessionId: SessionId, runId: AgentRunId): Promise<readonly ToolDefinition[]> {
		const tools: ToolDefinition[] = [];
		for (const source of this.sources) {
			try {
				const offered = await source.open(sessionId, runId);
				this.opened.push(source);
				tools.push(...offered);
			} catch (error) {
				if (!(error instanceof ToolSourceAuthError)) throw error;
				this.refused.push(error);
			}
		}
		return tools;
	}

	/** What could not be authorized, for the run to record before it carries on. */
	public get unauthorized(): readonly ToolSourceAuthError[] {
		return [...this.refused];
	}

	/** Closes everything that opened; one source that will not close never hides another. */
	public async close(runId: AgentRunId): Promise<void> {
		const closing = this.opened.splice(0);
		await Promise.all(closing.map((source) => source.close(runId).catch(() => undefined)));
	}
}
