export class SessionStatus {
	public static readonly ACTIVE = new SessionStatus("active");
	public static readonly SUSPENDED = new SessionStatus("suspended");
	public static readonly CLOSED = new SessionStatus("closed");

	private constructor(public readonly name: string) {}

	public static fromName(name: string): SessionStatus | undefined {
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
