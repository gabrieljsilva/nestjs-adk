import { describe, expect, it } from "vitest";
import { ConsumerNoticeSink } from "../../contracts/consumer-notice-sink";
import { ConsumerFailed } from "../../domain/event/consumer-failed";
import { NoOpConsumerNoticeSink } from "./no-op-consumer-notice-sink";

describe("NoOpConsumerNoticeSink", () => {
	it("accepts a notice without doing anything with it", () => {
		const sink = new NoOpConsumerNoticeSink();

		expect(() => sink.report(new ConsumerFailed("otel", "run.started", "boom", false))).not.toThrow();
	});

	it("is a sink, so the runtime never has to check whether one exists", () => {
		expect(new NoOpConsumerNoticeSink()).toBeInstanceOf(ConsumerNoticeSink);
	});
});
