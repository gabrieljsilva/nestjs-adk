import { ConsumerFailureSink } from "../../contracts/events/consumer-failure-sink.contract";
import type { ConsumerFailed } from "../../domain/event/consumer-failed.notice";
import type { SessionContext } from "../../domain/run/session-context.value-object";

export class NoOpConsumerFailureSink extends ConsumerFailureSink {
	public report(_context: SessionContext | undefined, _notice: ConsumerFailed): void {}
}
