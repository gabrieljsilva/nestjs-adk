import { AgentName, AgentRunId, SessionId, ToolCallId } from "@nestjs-adk/core";

const MCP_AGENT = AgentName.from("mcp");

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
