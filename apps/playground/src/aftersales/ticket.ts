/**
 * A complaint somebody opened about an order.
 *
 * It points at the conversation it came out of rather than at the files that were sent:
 * what the customer attached is already in the session, and copying an address into a
 * second place is how the two stop agreeing. A ticket opened on the site has no
 * conversation, which is the one case where that field is absent.
 */
export class Ticket {
	private constructor(
		public readonly id: string,
		public readonly orderId: string,
		public readonly reason: string,
		public readonly openedAt: string,
		public readonly sessionId?: string,
	) {}

	public static of(id: string, orderId: string, reason: string, openedAt: string, sessionId?: string): Ticket {
		return new Ticket(id, orderId, reason, openedAt, sessionId);
	}

	public get fromConversation(): boolean {
		return this.sessionId !== undefined;
	}
}
