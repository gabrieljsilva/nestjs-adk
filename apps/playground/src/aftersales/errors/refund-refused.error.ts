import { AdkError } from "@nestjs-adk/core";

/**
 * The policy said no, so no money left the store.
 *
 * It carries the reason the policy gave, because the tool that raised it answers the run
 * with that sentence and the customer is owed the same sentence a human would have said.
 */
export class RefundRefusedError extends AdkError {
	public readonly code = "PLAYGROUND_REFUND_REFUSED";

	public constructor(
		public readonly orderId: string,
		public readonly reason: string,
	) {
		super(`Refund of order ${orderId} refused: ${reason}.`);
	}
}
