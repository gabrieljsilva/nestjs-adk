import type { ContextNoticeSink } from "../../contracts/context/context-notice-sink.contract";
import { ContextWindowUnknown } from "../../domain/context/context-window-unknown.value-object";
import type { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { NoOpContextNoticeSink } from "./no-op-context-notice-sink.adapter";

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
