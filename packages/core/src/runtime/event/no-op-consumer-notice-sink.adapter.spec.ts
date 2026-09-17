import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ConsumerNoticeSink } from "../../contracts/events/consumer-notice-sink.contract";
import { ConsumerFailed } from "../../domain/event/consumer-failed.notice";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { NoOpConsumerNoticeSink } from "./no-op-consumer-notice-sink.adapter";

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

describe("NoOpConsumerNoticeSink", () => {
	it("accepts a notice without doing anything with it", () => {
		const sink = new NoOpConsumerNoticeSink();

		expect(() => sink.report(CTX, new ConsumerFailed("otel", "run.started", "boom", false))).not.toThrow();
	});

	it("is a sink, so the runtime never has to check whether one exists", () => {
		expect(new NoOpConsumerNoticeSink()).toBeInstanceOf(ConsumerNoticeSink);
	});
});
