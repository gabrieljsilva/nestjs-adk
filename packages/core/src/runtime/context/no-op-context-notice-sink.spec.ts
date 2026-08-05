import { describe, expect, it } from "vitest";
import { ContextNoticeSink } from "../../contracts/context-notice-sink";
import { ContextWindowUnknown } from "../../domain/context/context-window-unknown";
import { ModelIdentity } from "../../domain/model/model-identity";
import { NoOpContextNoticeSink } from "./no-op-context-notice-sink";

describe("NoOpContextNoticeSink", () => {
	it("accepts a notice and does nothing with it", () => {
		expect(() =>
			new NoOpContextNoticeSink().report(new ContextWindowUnknown(ModelIdentity.of("acme", "m-1"))),
		).not.toThrow();
	});

	it("is a notice sink", () => {
		expect(new NoOpContextNoticeSink()).toBeInstanceOf(ContextNoticeSink);
	});
});
