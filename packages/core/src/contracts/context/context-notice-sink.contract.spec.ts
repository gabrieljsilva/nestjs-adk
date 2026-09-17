import { describe, expect, it } from "vitest";
import { ContextWindowUnknown } from "../../domain/context/context-window-unknown.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { ContextNoticeSink } from "./context-notice-sink.contract";

class RecordingSink extends ContextNoticeSink {
	public readonly notices: ContextWindowUnknown[] = [];

	public report(_context: SessionContext | undefined, notice: ContextWindowUnknown): void {
		this.notices.push(notice);
	}
}

describe("ContextNoticeSink", () => {
	it("receives the notice the runtime produced", () => {
		const sink = new RecordingSink();

		sink.report(undefined, new ContextWindowUnknown(ModelIdentity.of("acme", "m-1")));

		expect(sink.notices).toHaveLength(1);
	});

	it("is the type the runtime depends on", () => {
		expect(new RecordingSink()).toBeInstanceOf(ContextNoticeSink);
	});
});
