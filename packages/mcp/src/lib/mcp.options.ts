/**
 * How to reach an MCP server, and the three ways there are.
 *
 * `stdio` spawns a local process and talks to it over its pipes, which is how a server that ships
 * as a CLI is used. `http` and `sse` reach a remote one, and both carry headers, which is where a
 * resolved credential lands.
 */
export type McpTransportConfig =
	| { type: "stdio"; command: string; args?: readonly string[]; env?: Record<string, string> }
	| { type: "http"; url: string; headers?: Record<string, string> }
	| { type: "sse"; url: string; headers?: Record<string, string> };

export const MCP_OPTIONS = Symbol("adk:mcp-options");
