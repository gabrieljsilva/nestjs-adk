import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { InvalidStructuredOutputError } from "./invalid-structured-output.error";

describe("InvalidStructuredOutputError", () => {
	it("carries a stable code", () => {
		expect(new InvalidStructuredOutputError("not JSON", "hi").code).toBe("MODEL_INVALID_STRUCTURED_OUTPUT");
	});

	it("states the reason in the message", () => {
		expect(new InvalidStructuredOutputError("the answer is not valid JSON", "hi").message).toContain("not valid JSON");
	});

	it("keeps the raw answer, because the cause is usually visible in it", () => {
		expect(new InvalidStructuredOutputError("not JSON", "I cannot do that").answer).toBe("I cannot do that");
	});

	it("is an adk error", () => {
		expect(new InvalidStructuredOutputError("not JSON", "hi")).toBeInstanceOf(AdkError);
	});
});
