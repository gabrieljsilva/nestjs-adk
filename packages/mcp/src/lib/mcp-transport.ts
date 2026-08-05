import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpCredential } from "./mcp-auth";
import type { McpTransportConfig } from "./mcp-options";

/**
 * Builds the SDK transport, applying a resolved credential where that transport can carry one:
 * headers over HTTP and SSE, environment variables for a local process. This is the single point
 * where the two otherwise independent axes (transport and authentication) touch.
 */
export function createTransport(
	transport: McpTransportConfig,
	credential?: McpCredential,
	/**
	 * Replaces the SDK's fetch for http and sse. `AdkMcpServer` passes the guarded fetch here, which
	 * is what puts the target guard on every request of the connection, redirects included, not only
	 * on the URL `open()` looked at. Boot config (`McpModule.forRoot`) passes nothing: that URL was
	 * written by the developer, and the developer connects to their own network on purpose.
	 */
	fetchImpl?: typeof fetch,
) {
	switch (transport.type) {
		case "stdio": {
			// Built on the SDK's safe subset (PATH, HOME and friends), never on the full process
			// environment. A credential is exactly the case that must NOT widen this: `EnvAuth` is how an
			// end user's own server gets its token, and inheriting everything would hand that server the
			// LLM provider key, the database URL and every other tenant's secret along with it.
			// `transport.env` is the developer's own declaration, so it is layered on top as asked.
			const env = { ...getDefaultEnvironment(), ...transport.env, ...credential?.env };
			// Copied at the SDK boundary: our config accepts a readonly array (a frozen literal from the
			// caller), while the SDK asks for a mutable one.
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
