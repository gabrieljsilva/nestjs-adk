import { AgentName, AgentRunId, SessionId, ToolCallId } from "@nestjs-adk/core";

const MCP_AGENT = AgentName.from("mcp");

/**
 * The identity of one client call, in the terms a tool context is written in.
 *
 * A tool reads `context.sessionId` and `context.runId` because on the agent's path they name a
 * conversation and a run. A client call has neither, so both carry the MCP request id under an
 * `mcp:` prefix: a tool that logs them sees where the call came from, and nothing on the agent's
 * side can collide with the name.
 */
export class McpCall {
	private constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		public readonly callId: ToolCallId,
		public readonly signal?: AbortSignal,
	) {
		Object.freeze(this);
	}

	public static fromRequest(requestId: string | number, sessionId?: string, signal?: AbortSignal): McpCall {
		const request = String(requestId);
		return new McpCall(
			SessionId.from(`mcp:${sessionId ?? "stateless"}`),
			AgentRunId.from(`mcp:${request}`),
			ToolCallId.from(`mcp:${request}`),
			signal,
		);
	}

	public get agent(): AgentName {
		return MCP_AGENT;
	}
}
