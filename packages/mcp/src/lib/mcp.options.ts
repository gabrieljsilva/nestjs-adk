/**
 * How a connection reaches its server. `stdio` spawns a local process and speaks over its
 * pipes, while `http` and `sse` reach a remote one and carry headers, which is where a resolved
 * credential lands.
 */
export type McpTransportConfig =
	| { type: "stdio"; command: string; args?: readonly string[]; env?: Record<string, string> }
	| { type: "http"; url: string; headers?: Record<string, string> }
	| { type: "sse"; url: string; headers?: Record<string, string> };

export const MCP_OPTIONS = Symbol("adk:mcp-options");
