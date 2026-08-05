/**
 * One consumer did not handle one event, and the run went on anyway.
 *
 * Observation is outside the transaction, so this is a notice and never an error: the
 * journal is already durable, and the only thing lost is that one consumer's view of
 * one event. It says whether the consumer refused or simply never came back, because a
 * throw and a hang call for different fixes.
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
