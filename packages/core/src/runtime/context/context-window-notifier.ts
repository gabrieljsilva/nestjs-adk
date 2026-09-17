import type { ContextNoticeSink } from "../../contracts/context/context-notice-sink";
import { ContextWindowUnknown } from "../../domain/context/context-window-unknown";
import type { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor";
import type { SessionContext } from "../../domain/run/session-context";
import { NoOpContextNoticeSink } from "./no-op-context-notice-sink";

/**
 * Says once per model that its context window is unknown, and then stops saying it.
 *
 * What it remembers is instance state belonging to one runtime, not a static register:
 * two runtimes in the same process are two independent readers of the same fact, and a
 * test never has to undo what an earlier test reported.
 */
export class ContextWindowNotifier {
	private readonly reported = new Set<string>();

	public constructor(private readonly sink: ContextNoticeSink = new NoOpContextNoticeSink()) {}

	public reportIfUnknown(context: SessionContext, descriptor: ModelDescriptor): void {
		if (descriptor.contextWindow.isKnown) return;
		const model = descriptor.identity.toString();
		if (this.reported.has(model)) return;
		this.reported.add(model);
		this.sink.report(context, new ContextWindowUnknown(descriptor.identity));
	}
}
