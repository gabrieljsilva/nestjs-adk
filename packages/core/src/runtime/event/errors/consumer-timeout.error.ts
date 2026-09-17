import { AdkError } from "../../../common/errors/adk.error";

export class ConsumerTimeoutError extends AdkError {
	public readonly code = "EVENT_CONSUMER_TIMEOUT";

	public constructor(
		public readonly consumer: string,
		public readonly timeoutMs: number,
	) {
		super(`Consumer ${consumer} took longer than ${timeoutMs} ms.`);
	}
}
