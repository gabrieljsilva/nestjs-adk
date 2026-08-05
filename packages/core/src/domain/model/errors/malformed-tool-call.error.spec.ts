import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { MalformedToolCallError } from "./malformed-tool-call.error";

describe("MalformedToolCallError", () => {
	it("carries a stable code", () => {
		expect(new MalformedToolCallError("refund", '{"a":').code).toBe("MODEL_MALFORMED_TOOL_CALL");
	});

	it("names the tool and shows what arrived", () => {
		const error = new MalformedToolCallError("refund", '{"orderId":');

		expect(error.message).toContain("refund");
		expect(error.message).toContain('{"orderId":');
	});

	it("is an adk error", () => {
		expect(new MalformedToolCallError("refund", "{")).toBeInstanceOf(AdkError);
	});
});
