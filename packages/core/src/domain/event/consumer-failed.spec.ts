import { describe, expect, it } from "vitest";
import { ConsumerFailed } from "./consumer-failed";

describe("ConsumerFailed", () => {
	it("names the consumer, the event and why it did not handle it", () => {
		const notice = new ConsumerFailed("otel", "run.started", "connection refused", false);

		expect(notice.toString()).toBe("otel failed on run.started: connection refused");
	});

	it("tells a hang apart from a refusal, because the fix is different", () => {
		const notice = new ConsumerFailed("otel", "run.started", "took longer than 5000 ms", true);

		expect(notice.timedOut).toBe(true);
		expect(notice.toString()).toContain("timed out on");
	});
});
