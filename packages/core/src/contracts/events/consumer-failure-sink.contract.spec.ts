import { describe, expect, it } from "vitest";
import { ConsumerFailed } from "../../domain/event/consumer-failed.notice";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { ConsumerFailureSink } from "./consumer-failure-sink.contract";

class RecordingSink extends ConsumerFailureSink {
	public readonly notices: ConsumerFailed[] = [];

	public report(_context: SessionContext | undefined, notice: ConsumerFailed): void {
		this.notices.push(notice);
	}
}

describe("ConsumerFailureSink", () => {
	it("receives the notice a failed consumer produced", () => {
		const sink = new RecordingSink();

		sink.report(undefined, new ConsumerFailed("otel", "run.started", "boom", false));

		expect(sink.notices).toHaveLength(1);
	});

	it("is the type the runtime depends on", () => {
		expect(new RecordingSink()).toBeInstanceOf(ConsumerFailureSink);
	});
});
