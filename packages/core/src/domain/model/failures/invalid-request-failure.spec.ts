import { describe, expect, it } from "vitest";
import { InvalidRequestFailure } from "./invalid-request-failure";
import { UnknownFailure } from "./unknown-failure";

describe("InvalidRequestFailure", () => {
	it("says the request is what was refused, which no other failure claims", () => {
		expect(new InvalidRequestFailure("bad schema").isInvalidRequest).toBe(true);
		expect(new UnknownFailure("something").isInvalidRequest).toBe(false);
	});

	it("is not transient, because sending the same request again changes nothing", () => {
		expect(new InvalidRequestFailure("bad schema").isTransient).toBe(false);
	});

	it("keeps the provider error as the cause, so the message survives the classification", () => {
		const cause = new Error("400 unsupported field");

		const failure = new InvalidRequestFailure("400 unsupported field", cause);

		expect(failure.kind).toBe("invalid-request");
		expect(failure.message).toBe("400 unsupported field");
		expect(failure.cause).toBe(cause);
	});
});
