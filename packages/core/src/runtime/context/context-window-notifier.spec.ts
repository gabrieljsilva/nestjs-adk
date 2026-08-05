import { describe, expect, it } from "vitest";
import { ContextNoticeSink } from "../../contracts/context-notice-sink";
import type { ContextWindowUnknown } from "../../domain/context/context-window-unknown";
import { ModelCapabilities } from "../../domain/model/model-capabilities";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelDescriptor } from "../../domain/model/model-descriptor";
import { ModelIdentity } from "../../domain/model/model-identity";
import { UnknownContextWindow } from "../../domain/model/unknown-context-window";
import { ContextWindowNotifier } from "./context-window-notifier";

class RecordingSink extends ContextNoticeSink {
	public readonly notices: ContextWindowUnknown[] = [];

	public report(notice: ContextWindowUnknown): void {
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

describe("ContextWindowNotifier", () => {
	it("reports a model that declares no window", () => {
		const sink = new RecordingSink();

		new ContextWindowNotifier(sink).reportIfUnknown(descriptorOf("m-1", false));

		expect(sink.notices).toHaveLength(1);
		expect(sink.notices[0]?.model.model).toBe("m-1");
	});

	it("says nothing about a model that declares one", () => {
		const sink = new RecordingSink();

		new ContextWindowNotifier(sink).reportIfUnknown(descriptorOf("m-1", true));

		expect(sink.notices).toHaveLength(0);
	});

	it("reports each model once, however often it is asked", () => {
		const sink = new RecordingSink();
		const notifier = new ContextWindowNotifier(sink);

		notifier.reportIfUnknown(descriptorOf("m-1", false));
		notifier.reportIfUnknown(descriptorOf("m-1", false));
		notifier.reportIfUnknown(descriptorOf("m-1", false));

		expect(sink.notices).toHaveLength(1);
	});

	it("reports each unknown model on its own", () => {
		const sink = new RecordingSink();
		const notifier = new ContextWindowNotifier(sink);

		notifier.reportIfUnknown(descriptorOf("m-1", false));
		notifier.reportIfUnknown(descriptorOf("m-2", false));

		expect(sink.notices.map((notice) => notice.model.model)).toEqual(["m-1", "m-2"]);
	});

	it("remembers per instance, so another runtime reports the same model again", () => {
		const sink = new RecordingSink();

		new ContextWindowNotifier(sink).reportIfUnknown(descriptorOf("m-1", false));
		new ContextWindowNotifier(sink).reportIfUnknown(descriptorOf("m-1", false));

		expect(sink.notices).toHaveLength(2);
	});

	it("works without a sink", () => {
		expect(() => new ContextWindowNotifier().reportIfUnknown(descriptorOf("m-1", false))).not.toThrow();
	});
});
