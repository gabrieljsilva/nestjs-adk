import type { IncomingHttpHeaders } from "node:http";

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * The incoming MCP request as a resolver reads it: its headers, method and path, with
 * `bearerToken` already parsed out of `Authorization`. It is frozen and carries no body.
 */
export class McpRequest {
	private readonly headers: IncomingHttpHeaders;

	public constructor(
		headers: IncomingHttpHeaders,
		public readonly method = "POST",
		public readonly url = "/",
	) {
		this.headers = { ...headers };
		Object.freeze(this);
	}

	public header(name: string): string | undefined {
		const value = this.headers[name.toLowerCase()];
		if (Array.isArray(value)) return value[0];
		return value;
	}

	public get bearerToken(): string | undefined {
		const authorization = this.header("authorization");
		if (authorization === undefined) return undefined;
		return BEARER.exec(authorization.trim())?.[1];
	}
}
