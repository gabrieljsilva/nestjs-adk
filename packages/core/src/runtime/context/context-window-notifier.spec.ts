import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { ContextNoticeSink } from "../../contracts/context/context-notice-sink";
import type { ContextWindowUnknown } from "../../domain/context/context-window-unknown";
import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity";
import { UnknownContextWindow } from "../../domain/model/descriptor/unknown-context-window";
import { SessionContext } from "../../domain/run/session-context";
import { ContextWindowNotifier } from "./context-window-notifier";

class RecordingSink extends ContextNoticeSink {
	public readonly notices: ContextWindowUnknown[] = [];

	public report(_context: SessionContext | undefined, notice: ContextWindowUnknown): void {
		this.notices.push(notice);
	}
}

function descriptorOf(model: string, known: boolean): ModelDescriptor {
	return new ModelDescriptor(
		ModelIdentity.of("acme", model),
		known ? ModelContextWindow.of(1000, 100) : new UnknownContextWindow(),
		ModelCapabilities.none(),
	);
}

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

describe("ContextWindowNotifier", () => {
	it("reports a model that declares no window", () => {
		const sink = new RecordingSink();

		new ContextWindowNotifier(sink).reportIfUnknown(CTX, descriptorOf("m-1", false));

		expect(sink.notices).toHaveLength(1);
		expect(sink.notices[0]?.model.model).toBe("m-1");
	});

	it("says nothing about a model that declares one", () => {
		const sink = new RecordingSink();

		new ContextWindowNotifier(sink).reportIfUnknown(CTX, descriptorOf("m-1", true));

		expect(sink.notices).toHaveLength(0);
	});

	it("reports each model once, however often it is asked", () => {
		const sink = new RecordingSink();
		const notifier = new ContextWindowNotifier(sink);

		notifier.reportIfUnknown(CTX, descriptorOf("m-1", false));
		notifier.reportIfUnknown(CTX, descriptorOf("m-1", false));
		notifier.reportIfUnknown(CTX, descriptorOf("m-1", false));

		expect(sink.notices).toHaveLength(1);
	});

	it("reports each unknown model on its own", () => {
		const sink = new RecordingSink();
		const notifier = new ContextWindowNotifier(sink);

		notifier.reportIfUnknown(CTX, descriptorOf("m-1", false));
		notifier.reportIfUnknown(CTX, descriptorOf("m-2", false));

		expect(sink.notices.map((notice) => notice.model.model)).toEqual(["m-1", "m-2"]);
	});

	it("remembers per instance, so another runtime reports the same model again", () => {
		const sink = new RecordingSink();

		new ContextWindowNotifier(sink).reportIfUnknown(CTX, descriptorOf("m-1", false));
		new ContextWindowNotifier(sink).reportIfUnknown(CTX, descriptorOf("m-1", false));

		expect(sink.notices).toHaveLength(2);
	});

	it("works without a sink", () => {
		expect(() => new ContextWindowNotifier().reportIfUnknown(CTX, descriptorOf("m-1", false))).not.toThrow();
	});
});
