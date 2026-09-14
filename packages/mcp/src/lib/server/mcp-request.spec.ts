import { describe, expect, it } from "vitest";
import { McpRequest } from "./mcp-request";

describe("McpRequest", () => {
	it("reads a header whatever the case it is asked in", () => {
		const request = McpRequest.of({ "x-workspace-id": "w-1" });

		expect(request.header("X-Workspace-Id")).toBe("w-1");
		expect(request.header("missing")).toBeUndefined();
	});

	it("answers the first value of a repeated header", () => {
		expect(McpRequest.of({ "x-tenant": ["a", "b"] }).header("x-tenant")).toBe("a");
	});

	it("extracts the bearer token and nothing else", () => {
		expect(McpRequest.of({ authorization: "Bearer abc.def" }).bearerToken).toBe("abc.def");
		expect(McpRequest.of({ authorization: "bearer   abc" }).bearerToken).toBe("abc");
		expect(McpRequest.of({ authorization: "Basic abc" }).bearerToken).toBeUndefined();
		expect(McpRequest.of({}).bearerToken).toBeUndefined();
	});

	it("carries the method and the path, with defaults for a request that named none", () => {
		expect(McpRequest.of({}, "GET", "/mcp").method).toBe("GET");
		expect(McpRequest.of({}, "GET", "/mcp").url).toBe("/mcp");
		expect(McpRequest.of({}).method).toBe("POST");
	});

	it("does not share the headers object it was given", () => {
		const headers: Record<string, string> = { authorization: "Bearer one" };
		const request = McpRequest.of(headers);
		headers.authorization = "Bearer two";

		expect(request.bearerToken).toBe("one");
	});
});
