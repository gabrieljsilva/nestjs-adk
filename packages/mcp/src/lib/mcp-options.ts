export type McpTransportConfig =
	| { type: "stdio"; command: string; args?: readonly string[]; env?: Record<string, string> }
	| { type: "http"; url: string; headers?: Record<string, string> }
	| { type: "sse"; url: string; headers?: Record<string, string> };

export const MCP_OPTIONS = Symbol("adk:mcp-options");
