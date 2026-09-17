import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import { ToolSourceAuthError } from "../../domain/tool/errors/tool-source-auth.error";
import { ToolSourceUnavailableError } from "../../domain/tool/errors/tool-source-unavailable.error";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";

export class ToolSourceScope {
	private readonly opened: ToolSource[] = [];
	private readonly refused: ToolSourceAuthError[] = [];
	private readonly unreachable: ToolSourceUnavailableError[] = [];
	private readonly sources: readonly ToolSource[];

	public constructor(declared: readonly ToolSource[] = [], perRun: readonly ToolSource[] = []) {
		this.sources = [...declared, ...perRun];
	}

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

	public get unavailable(): readonly ToolSourceUnavailableError[] {
		return [...this.unreachable];
	}

	public get unauthorized(): readonly ToolSourceAuthError[] {
		return [...this.refused];
	}

	public async close(runId: AgentRunId): Promise<void> {
		const closing = this.opened.splice(0);
		await Promise.all(closing.map((source) => source.close(runId).catch(() => undefined)));
	}
}
