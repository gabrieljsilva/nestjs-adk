export type McpTransportConfig =
	| { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
	| { type: "http"; url: string; headers?: Record<string, string> }
	| { type: "sse"; url: string; headers?: Record<string, string> };

export interface McpServerConfig {
	name: string;
	transport: McpTransportConfig;
	/** Server fora no boot: `true` → warning e agente sobe sem essas tools; default → McpConnectionError. */
	optional?: boolean;
}

export interface McpModuleOptions {
	servers: McpServerConfig[];
}

export const MCP_OPTIONS = Symbol("adk:mcp-options");
