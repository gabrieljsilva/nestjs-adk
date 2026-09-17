import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ContextNoticeSink } from "../../contracts/context/context-notice-sink.contract";
import { ContextWindowUnknown } from "../../domain/context/context-window-unknown.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { NoOpContextNoticeSink } from "./no-op-context-notice-sink.adapter";

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

describe("NoOpContextNoticeSink", () => {
	it("accepts a notice and does nothing with it", () => {
		expect(() =>
			new NoOpContextNoticeSink().report(CTX, new ContextWindowUnknown(new ModelIdentity("acme", "m-1"))),
		).not.toThrow();
	});

	it("is a notice sink", () => {
		expect(new NoOpContextNoticeSink()).toBeInstanceOf(ContextNoticeSink);
	});
});
