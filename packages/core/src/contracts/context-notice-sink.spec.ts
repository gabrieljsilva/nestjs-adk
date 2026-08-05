import { describe, expect, it } from "vitest";
import { ContextWindowUnknown } from "../domain/context/context-window-unknown";
import { ModelIdentity } from "../domain/model/model-identity";
import { ContextNoticeSink } from "./context-notice-sink";

class RecordingSink extends ContextNoticeSink {
	public readonly notices: ContextWindowUnknown[] = [];

	public report(notice: ContextWindowUnknown): void {
		this.notices.push(notice);
	}
}

describe("ContextNoticeSink", () => {
	it("receives the notice the runtime produced", () => {
		const sink = new RecordingSink();

		sink.report(new ContextWindowUnknown(ModelIdentity.of("acme", "m-1")));

		expect(sink.notices).toHaveLength(1);
	});

	it("is the type the runtime depends on", () => {
		expect(new RecordingSink()).toBeInstanceOf(ContextNoticeSink);
	});
});
