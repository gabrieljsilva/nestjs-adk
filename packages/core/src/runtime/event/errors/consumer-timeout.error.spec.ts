import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ConsumerTimeoutError } from "./consumer-timeout.error";

describe("ConsumerTimeoutError", () => {
	it("names the consumer and the time it was given", () => {
		const error = new ConsumerTimeoutError("otel", 5000);

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("EVENT_CONSUMER_TIMEOUT");
		expect(error.message).toContain("otel");
		expect(error.message).toContain("5000");
	});
});
