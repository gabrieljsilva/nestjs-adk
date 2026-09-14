import type { IncomingHttpHeaders } from "node:http";

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * What an actor resolver is allowed to read of the request: the headers, the method and the
 * path. Never the body, which is the protocol's and has not been parsed for the resolver's
 * benefit, and never the response, which the endpoint owns.
 */
export class McpRequest {
	private constructor(
		private readonly headers: IncomingHttpHeaders,
		public readonly method: string,
		public readonly url: string,
	) {
		Object.freeze(this);
	}

	public static of(headers: IncomingHttpHeaders, method = "POST", url = "/"): McpRequest {
		return new McpRequest({ ...headers }, method, url);
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
