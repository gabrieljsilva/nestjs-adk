/**
 * One consumer did not handle one event, and the run went on anyway.
 *
 * A notice and never an error: the journal is already durable. `timedOut` tells a
 * consumer that threw from one that never came back.
 */
export class ConsumerFailed {
	public constructor(
		public readonly consumer: string,
		public readonly eventType: string,
		public readonly reason: string,
		public readonly timedOut: boolean,
	) {}

	public toString(): string {
		const how = this.timedOut ? "timed out on" : "failed on";
		return `${this.consumer} ${how} ${this.eventType}: ${this.reason}`;
	}
}
