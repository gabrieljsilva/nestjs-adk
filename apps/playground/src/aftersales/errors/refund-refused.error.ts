import { AdkError } from "@nestjs-adk/core";

export class RefundRefusedError extends AdkError {
	public readonly code = "PLAYGROUND_REFUND_REFUSED";

	public constructor(
		public readonly orderId: string,
		public readonly reason: string,
	) {
		super(`Refund of order ${orderId} refused: ${reason}.`);
	}
}
