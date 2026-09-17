import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { ContextNoticeSink } from "../../contracts/context/context-notice-sink";
import { ContextWindowUnknown } from "../../domain/context/context-window-unknown";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity";
import { SessionContext } from "../../domain/run/session-context";
import { NoOpContextNoticeSink } from "./no-op-context-notice-sink";

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

describe("NoOpContextNoticeSink", () => {
	it("accepts a notice and does nothing with it", () => {
		expect(() =>
			new NoOpContextNoticeSink().report(CTX, new ContextWindowUnknown(ModelIdentity.of("acme", "m-1"))),
		).not.toThrow();
	});

	it("is a notice sink", () => {
		expect(new NoOpContextNoticeSink()).toBeInstanceOf(ContextNoticeSink);
	});
});
