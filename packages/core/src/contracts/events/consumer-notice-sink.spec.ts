import { describe, expect, it } from "vitest";
import { ConsumerFailed } from "../../domain/event/consumer-failed";
import type { SessionContext } from "../../domain/run/session-context";
import { ConsumerNoticeSink } from "./consumer-notice-sink";

class RecordingSink extends ConsumerNoticeSink {
	public readonly notices: ConsumerFailed[] = [];

	public report(_context: SessionContext | undefined, notice: ConsumerFailed): void {
		this.notices.push(notice);
	}
}

describe("ConsumerNoticeSink", () => {
	it("receives the notice a failed consumer produced", () => {
		const sink = new RecordingSink();

		sink.report(undefined, new ConsumerFailed("otel", "run.started", "boom", false));

		expect(sink.notices).toHaveLength(1);
	});

	it("is the type the runtime depends on", () => {
		expect(new RecordingSink()).toBeInstanceOf(ConsumerNoticeSink);
	});
});
