import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpCredential } from "./mcp-auth.service";
import type { McpTransportConfig } from "./mcp.options";

export function createTransport(transport: McpTransportConfig, credential?: McpCredential, fetchImpl?: typeof fetch) {
	switch (transport.type) {
		case "stdio": {
			const env = { ...getDefaultEnvironment(), ...transport.env, ...credential?.env };
			return new StdioClientTransport({ command: transport.command, args: transport.args && [...transport.args], env });
		}
		case "http": {
			const headers = { ...transport.headers, ...credential?.headers };
			return new StreamableHTTPClientTransport(new URL(transport.url), { requestInit: { headers }, fetch: fetchImpl });
		}
		case "sse": {
			const headers = { ...transport.headers, ...credential?.headers };
			return new SSEClientTransport(new URL(transport.url), { requestInit: { headers }, fetch: fetchImpl });
		}
	}
}
