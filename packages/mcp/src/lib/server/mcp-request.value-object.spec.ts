import { describe, expect, it } from "vitest";
import { McpRequest } from "./mcp-request.value-object";

describe("McpRequest", () => {
	it("reads a header whatever the case it is asked in", () => {
		const request = new McpRequest({ "x-workspace-id": "w-1" });

		expect(request.header("X-Workspace-Id")).toBe("w-1");
		expect(request.header("missing")).toBeUndefined();
	});

	it("answers the first value of a repeated header", () => {
		expect(new McpRequest({ "x-tenant": ["a", "b"] }).header("x-tenant")).toBe("a");
	});

	it("extracts the bearer token and nothing else", () => {
		expect(new McpRequest({ authorization: "Bearer abc.def" }).bearerToken).toBe("abc.def");
		expect(new McpRequest({ authorization: "bearer   abc" }).bearerToken).toBe("abc");
		expect(new McpRequest({ authorization: "Basic abc" }).bearerToken).toBeUndefined();
		expect(new McpRequest({}).bearerToken).toBeUndefined();
	});

	it("carries the method and the path, with defaults for a request that named none", () => {
		expect(new McpRequest({}, "GET", "/mcp").method).toBe("GET");
		expect(new McpRequest({}, "GET", "/mcp").url).toBe("/mcp");
		expect(new McpRequest({}).method).toBe("POST");
	});

	it("does not share the headers object it was given", () => {
		const headers: Record<string, string> = { authorization: "Bearer one" };
		const request = new McpRequest(headers);
		headers.authorization = "Bearer two";

		expect(request.bearerToken).toBe("one");
	});
});
