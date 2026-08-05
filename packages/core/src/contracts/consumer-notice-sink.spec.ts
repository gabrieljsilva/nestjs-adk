import { describe, expect, it } from "vitest";
import { ConsumerFailed } from "../domain/event/consumer-failed";
import { ConsumerNoticeSink } from "./consumer-notice-sink";

class RecordingSink extends ConsumerNoticeSink {
	public readonly notices: ConsumerFailed[] = [];

	public report(notice: ConsumerFailed): void {
		this.notices.push(notice);
	}
}

describe("ConsumerNoticeSink", () => {
	it("receives the notice a failed consumer produced", () => {
		const sink = new RecordingSink();

		sink.report(new ConsumerFailed("otel", "run.started", "boom", false));

		expect(sink.notices).toHaveLength(1);
	});

	it("is the type the runtime depends on", () => {
		expect(new RecordingSink()).toBeInstanceOf(ConsumerNoticeSink);
	});
});
