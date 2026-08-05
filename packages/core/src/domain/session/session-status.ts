/** Where a session stands: running, waiting on a human, or closed for good. */
export class SessionStatus {
	public static readonly ACTIVE = new SessionStatus("active");
	public static readonly SUSPENDED = new SessionStatus("suspended");
	public static readonly CLOSED = new SessionStatus("closed");

	private constructor(public readonly name: string) {}

	/** The one instance a stored name denotes: identity is what `acceptsCommands` compares on. */
	public static of(name: string): SessionStatus | undefined {
		return [SessionStatus.ACTIVE, SessionStatus.SUSPENDED, SessionStatus.CLOSED].find((status) => status.name === name);
	}

	public get acceptsCommands(): boolean {
		return this !== SessionStatus.CLOSED;
	}

	public equals(other: SessionStatus): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
