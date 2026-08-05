/**
 * Whether the session outlives the run that created it.
 * An ephemeral session keeps state only while the run executes; a durable one is
 * journaled and can be rehydrated later.
 */
export class SessionMode {
	public static readonly EPHEMERAL = new SessionMode("ephemeral");
	public static readonly DURABLE = new SessionMode("durable");

	private constructor(public readonly name: string) {}

	/** The one instance a stored name denotes: identity is what `isDurable` compares on. */
	public static of(name: string): SessionMode | undefined {
		return [SessionMode.EPHEMERAL, SessionMode.DURABLE].find((mode) => mode.name === name);
	}

	public get isDurable(): boolean {
		return this === SessionMode.DURABLE;
	}

	public equals(other: SessionMode): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
