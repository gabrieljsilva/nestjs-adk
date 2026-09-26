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
